import { execFile, fork, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Gateway } from './gateway.js'
import type { ProxyAgent } from 'undici'

/**
 * How long a new public address may take to answer before the start counts as failed.
 * Cloudflare publishes a brand-new quick-tunnel hostname to DNS only after the tunnel is
 * registered, and on some networks that takes a full minute; measuring this machine showed
 * the name still ENOTFOUND at 60 s and reachable at 61 s, so the window must be well past that.
 */
const VERIFY_MS = 90_000
/** A name that does not resolve yet is not a failure; it is the service still publishing it. */
const DNS_WAIT_MS = 180_000

/**
 * The services that can give this computer a temporary public address.
 * - cloudflare: Cloudflare Quick Tunnel through cloudflared, started detached so the address
 *   outlives this Host; the binary is downloaded on first use.
 * - ssh: localhost.run through the system's own `ssh`; nothing to download, no account.
 */
export type Route = 'cloudflare' | 'ssh'
export const ROUTES: Record<Route, { name: string; suffix: string }> = {
  cloudflare: { name: 'Cloudflare', suffix: '.trycloudflare.com' },
  ssh: { name: 'localhost.run', suffix: '.lhr.life' },
}
export const ROUTE_IDS = Object.keys(ROUTES) as Route[]
/** A host under one of these names exists only while its tunnel is open. */
export function isTemporaryHost(host: string | undefined): boolean {
  const name = host?.toLowerCase().split(':')[0]
  return !!name && ROUTE_IDS.some(route => name.endsWith(ROUTES[route].suffix))
}

/**
 * What the previous run left behind: the tunnel process it started, still detached and still
 * reachable, and the address it publishes. Reusing it is what keeps a paired phone paired, because
 * its authorization cookie belongs to that address and to no other.
 */
interface TunnelState { pid: number; url: string; port: number; at: number }

function alive(pid: number | undefined): boolean {
  if (!pid) return false
  try { process.kill(pid, 0); return true } catch (failure) { return (failure as NodeJS.ErrnoException).code === 'EPERM' }
}

export type TunnelPhase = 'off' | 'downloading' | 'starting' | 'verifying' | 'ready' | 'error'
export class TunnelManager {
  phase: TunnelPhase = 'off'
  url?: string
  error?: string
  /** The service in use, or being tried. */
  route?: Route
  /** The address stopped answering this computer's own check; phones may still reach it. */
  warning?: string
  /** Why the service in use is not the first choice. */
  note?: string
  private verifyUntil = 0
  /** When the address was first seen failing only because its name had not been published yet. */
  private unpublishedSince = 0
  /** True while the note shown is this plugin's own "waiting for the name" message. */
  private publishing = false
  private child?: ChildProcess
  /** A tunnel that survived the last restart: not this process's child, but this plugin's to reuse. */
  private adopted?: number
  private generation = 0
  private timer?: ReturnType<typeof setTimeout>
  private monitor?: ReturnType<typeof setInterval>
  private failures = 0
  private checking = false
  private lastFailure = ''
  private proxy?: ProxyAgent
  private undici?: typeof import('undici')
  private proxyAddress?: string
  /** Services still to try if the current one does not come up. */
  private remaining: Route[] = []
  private everReady = false
  private knownHosts = ''
  /** Where the reusable tunnel is remembered between runs; empty means nothing is kept. */
  private stateFile = ''
  /** True once per start, so the first attempt may reuse the address of the previous run. */
  private allowReuse = false
  /** True while the attempt in flight is the reused one, which may fall back to a fresh tunnel. */
  private revived = false
  /** The address already reported to the caller as good. */
  private announced?: string
  constructor(
    private readonly gateway: Gateway,
    private readonly onFailure?: (message: string) => void,
    /** Called once each time an address starts answering, e.g. to retire records of older ones. */
    private readonly onReady?: (url: string) => void,
  ) {}

  /** Open a public address, trying `routes` in order until one answers. */
  async start(proxy?: string, routes: Route[] = ['cloudflare'], knownHosts = '', stateFile = '', reuse = true): Promise<void> {
    this.release()
    this.stateFile = stateFile
    this.allowReuse = reuse && !!stateFile
    this.revived = false
    this.proxyAddress = proxy
    // undici is only needed to go through a proxy, so it is loaded here rather than with the plugin.
    this.undici = proxy ? await import('undici') : undefined
    this.proxy = proxy && this.undici ? new this.undici.ProxyAgent(proxy) : undefined
    this.knownHosts = knownHosts
    this.remaining = [...routes]
    this.error = undefined; this.warning = undefined; this.note = undefined; this.everReady = false; this.announced = undefined
    this.launch(++this.generation)
  }

  private launch(generation: number): void {
    const route = this.route = this.remaining.shift() ?? 'cloudflare'
    this.phase = 'starting'; this.failures = 0; this.unpublishedSince = 0; this.publishing = false
    if (route === 'cloudflare' && this.allowReuse) {
      this.allowReuse = false
      const kept = this.kept()
      if (kept) { this.revive(kept, generation); return }
    }
    this.timer = setTimeout(() => { if (generation === this.generation) this.fail('开启超过 120 秒仍未完成；请检查电脑的网络，或给电脑设置网络代理后重试。') }, 120000); this.timer.unref()
    const child = this.child = route === 'ssh' ? this.launchSsh(generation) : this.launchCloudflare(generation)
    child.on('error', (failure: NodeJS.ErrnoException) => {
      if (generation !== this.generation) return
      this.fail(route === 'ssh' && failure.code === 'ENOENT' ? '这台电脑没有 ssh 命令，无法使用 localhost.run 线路。Windows 可在“可选功能”里添加 OpenSSH 客户端。' : '无法启动连接组件。')
    })
    child.on('exit', () => { if (generation === this.generation && this.phase !== 'off' && this.phase !== 'error') this.fail('连接组件已退出，请重新开启。') })
  }

  /**
   * Take over the tunnel of the previous run instead of opening a new one. The address is the same,
   * so every phone that was paired on it stays paired; only a restart that lost the address needs
   * another scan. The tunnel itself is a detached process, so it outlived the Host that started it.
   */
  private revive(state: TunnelState, generation: number): void {
    this.url = state.url; this.adopted = state.pid; this.phase = 'verifying'; this.revived = true
    try { this.gateway.allowAuthority(new URL(state.url).host) } catch { this.drop(); this.launch(generation); return }
    this.note = '沿用上次的远程地址，已配对的手机不用重新扫码。'
    this.verifyUntil = Date.now() + VERIFY_MS; this.unpublishedSince = 0
    this.timer = setTimeout(() => { if (generation === this.generation) this.fail(`上次的远程地址（${this.lastFailure || '未响应'}）已经不通了。`) }, 120000); this.timer.unref()
    void this.probe(generation)
  }

  private launchCloudflare(generation: number): ChildProcess {
    const env: NodeJS.ProcessEnv = { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_USE_ENV_PROXY: '1', DSH_RC_TUNNEL_PORT: String(this.gateway.port) }
    if (this.stateFile) env.DSH_RC_TUNNEL_LOG = `${this.stateFile}.log`
    if (this.proxyAddress) Object.assign(env, { HTTPS_PROXY: this.proxyAddress, HTTP_PROXY: this.proxyAddress })
    const child = fork(fileURLToPath(new URL('./tunnel-worker.js', import.meta.url)), [], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], execArgv: [] })
    // Drain package logging without exposing URLs/credentials in Host logs.
    child.stdout?.resume(); child.stderr?.resume()
    child.on('message', value => {
      if (generation !== this.generation || !value || typeof value !== 'object' || !('phase' in value)) return
      const message = value as { phase: string; url?: string; error?: string; pid?: number }
      if (message.phase === 'downloading' || message.phase === 'starting') this.phase = message.phase
      if (message.phase === 'error') this.fail(message.error ?? '连接通道启动失败。')
      if (message.phase === 'url' && message.url) this.accept(message.url, generation, message.pid)
    })
    return child
  }

  private launchSsh(generation: number): ChildProcess {
    // Remote forwarding only: the service can reach this one local port and nothing else.
    // The service's host key is remembered on first use, in a file of this plugin's own.
    const options = ['StrictHostKeyChecking=accept-new', 'ServerAliveInterval=30', 'ServerAliveCountMax=3', 'ExitOnForwardFailure=yes', 'BatchMode=yes']
    if (this.knownHosts) options.push(`UserKnownHostsFile="${this.knownHosts}"`)
    const child = spawn('ssh', ['-T', ...options.flatMap(option => ['-o', option]), '-R', `80:127.0.0.1:${this.gateway.port}`, 'nokey@localhost.run'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let text = ''
    const read = (chunk: Buffer) => {
      if (generation !== this.generation) return
      text += chunk.toString('utf8')
      // The service announces the address in its greeting, and again whenever it assigns a new one.
      // The greeting (a QR code drawn in text) is far longer than the address, so search before trimming.
      const found = [...text.matchAll(/https:\/\/([a-z0-9-]+\.lhr\.life)\b/g)].at(-1)
      text = text.slice(-200)
      if (found && this.url !== `https://${found[1]}`) this.accept(`https://${found[1]}`, generation)
    }
    child.stdout?.on('data', read); child.stderr?.on('data', read)
    return child
  }

  /** A service reported an address: check that it is one of its own, then that it reaches the gateway. */
  private accept(address: string, generation: number, pid?: number): void {
    const suffix = ROUTES[this.route ?? 'cloudflare'].suffix
    let url: URL
    try { url = new URL(address); if (url.protocol !== 'https:' || !url.hostname.endsWith(suffix) || url.username || url.password || url.port || url.pathname !== '/') throw new Error() }
    catch { this.fail('连接服务返回的地址不符合预期，请重试。'); return }
    clearTimeout(this.timer)
    if (this.url) this.gateway.disallowAuthority(new URL(this.url).host)
    this.url = url.origin; this.gateway.allowAuthority(url.host)
    this.phase = 'verifying'; this.verifyUntil = Date.now() + VERIFY_MS; this.unpublishedSince = 0
    // The tunnel is detached: remember the process and its address so the next run can revive both.
    this.adopted = undefined
    if (pid) this.save({ pid, url: this.url, port: this.gateway.port, at: Date.now() })
    void this.probe(generation)
  }

  private async probe(generation: number): Promise<void> {
    if (!this.url || this.checking) return
    this.checking = true
    let healthy = false
    let unpublished = false
    try {
      const address = this.gateway.healthURL(this.url)
      const ask = async (viaProxy: boolean) => {
        const init = { signal: AbortSignal.timeout(10000), redirect: 'error' as const }
        const response = viaProxy && this.proxy && this.undici ? await this.undici.fetch(address, { ...init, dispatcher: this.proxy }) : await fetch(address, init)
        const ok = response.ok && this.gateway.verifyHealth(await response.json())
        if (!ok) this.lastFailure = response.ok ? '网关验证信息不匹配' : `HTTP ${response.status}`
        return ok
      }
      // Either way out will do: this only asks whether the address reaches the gateway, and a proxy
      // that Cloudflare turns away says nothing about that.
      healthy = this.proxy ? await ask(true).catch(() => false) || await ask(false) : await ask(false)
    } catch (failure) {
      const code = (failure as { cause?: { code?: string }; name?: string }).cause?.code
      unpublished = code === 'ENOTFOUND' || code === 'EAI_AGAIN'
      this.lastFailure = code && /^[A-Z_0-9]+$/.test(code) ? code : (failure as Error).name === 'TimeoutError' ? '请求超时' : '网络请求失败'
    }
    finally { this.checking = false }
    if (generation !== this.generation) return
    if (healthy) {
      this.failures = 0; this.phase = 'ready'; this.everReady = true; this.warning = undefined; this.unpublishedSince = 0
      if (this.publishing) { this.publishing = false; this.note = undefined }
      clearTimeout(this.timer)
      if (!this.monitor) { this.monitor = setInterval(() => { void this.probe(generation) }, 30000); this.monitor.unref() }
      if (this.url && this.announced !== this.url) { this.announced = this.url; this.onReady?.(this.url) }
    } else if (this.phase === 'ready') {
      // This check leaves from the computer, whose route to the address can fail while phones still
      // get through. Only the tunnel process exiting ends a verified connection.
      if (++this.failures >= 3) this.warning = `这台电脑暂时访问不到自己的远程地址（${this.lastFailure}）。手机可能仍可使用；如果手机也连不上，请重新连接。`
    } else {
      // A brand-new quick-tunnel name is not in DNS yet: the service publishes it only after the
      // tunnel registers, and on some networks that takes about a minute. That is not a dead address,
      // so the normal window is extended instead of giving up on it.
      if (unpublished) {
        if (!this.unpublishedSince) this.unpublishedSince = Date.now()
        this.verifyUntil = Math.max(this.verifyUntil, this.unpublishedSince + DNS_WAIT_MS)
        if (!this.publishing) { this.publishing = true; this.note = '公共地址正在生效，第一次使用需要等一会儿。' }
      }
      if (Date.now() >= this.verifyUntil) this.fail(`远程地址没有连通（${this.lastFailure}）；请重试、给电脑设置网络代理，或改用“同一 Wi‑Fi”。`)
      else { this.timer = setTimeout(() => { void this.probe(generation) }, 3000); this.timer.unref() }
    }
  }

  private fail(message: string): void {
    if (this.url) this.gateway.disallowAuthority(new URL(this.url).host)
    this.url = undefined
    const generation = ++this.generation
    clearTimeout(this.timer); clearInterval(this.monitor); this.monitor = undefined
    const child = this.child; this.child = undefined
    void this.closeChild(child)
    // A reused address that went stale, or a tunnel this process inherited, ends here: its record would
    // only make the next start wait for an address that is not coming back.
    this.drop()
    // A service that never came up gives way to the next one; one that was working and then died does not,
    // because its address is what the phones are using.
    if (!this.everReady) {
      if (this.revived) { this.revived = false; this.note = '上次的远程地址已经不通了，正在申请新地址。'; this.launch(generation); return }
      if (this.remaining.length) {
        this.note = `${ROUTES[this.route ?? 'cloudflare'].name} 线路没有连通，已改用 ${ROUTES[this.remaining[0]!].name}。`
        this.launch(generation)
        return
      }
    }
    this.phase = 'error'; this.error = message; this.warning = undefined
    void this.proxy?.destroy(); this.proxy = undefined
    this.onFailure?.(message)
  }

  /** A service returned an address that is not usable, so nothing can be revived from it either. */
  private drop(): void {
    const adopted = this.adopted; this.adopted = undefined
    this.clearState(); this.killPid(adopted)
  }

  private async closeChild(child: ChildProcess | undefined): Promise<void> {
    if (!child || child.exitCode !== null || child.signalCode !== null) return
    await new Promise<void>(resolve => {
      const timer = setTimeout(() => {
        // Terminate only this plugin's owned process tree, including cloudflared.
        if (process.platform === 'win32' && child.pid) execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => resolve())
        else { child.kill('SIGKILL'); resolve() }
      }, 3000)
      child.once('exit', () => { clearTimeout(timer); resolve() })
      // The worker closes its tunnel when asked; a plain process is simply ended.
      if (child.connected) child.send('stop', () => {}); else child.kill()
    })
  }

  private killPid(pid: number | undefined): void {
    if (!pid || !alive(pid)) return
    if (process.platform === 'win32') execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => {})
    else { try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ } }
  }

  private save(state: TunnelState): void {
    if (!this.stateFile) return
    try { const temporary = `${this.stateFile}.tmp`; writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 }); renameSync(temporary, this.stateFile) } catch { /* only a convenience */ }
  }
  private clearState(): void {
    if (!this.stateFile) return
    try { unlinkSync(this.stateFile) } catch { /* nothing kept */ }
  }
  /** The tunnel of the previous run, if it is still alive and still reaches this gateway port. */
  private kept(): TunnelState | undefined {
    if (!this.stateFile) return undefined
    let state: TunnelState | undefined
    try {
      const raw = JSON.parse(readFileSync(this.stateFile, 'utf8')) as Partial<TunnelState>
      if (Number.isInteger(raw.pid) && typeof raw.url === 'string' && Number.isInteger(raw.port)) state = raw as TunnelState
    } catch { this.clearState(); return undefined }
    if (!state) { this.clearState(); return undefined }
    // A tunnel to another port would send phones to a gateway that is not there any more.
    if (state.port !== this.gateway.port || !alive(state.pid)) { this.drop(); return undefined }
    try {
      const url = new URL(state.url)
      if (url.protocol !== 'https:' || !url.hostname.endsWith(ROUTES.cloudflare.suffix) || url.pathname !== '/') { this.drop(); return undefined }
    } catch { this.drop(); return undefined }
    return state
  }

  /**
   * Stop watching the tunnel but leave it running, so the next start reuses the same address.
   * Used when a restart is already under way; the tunnel is a detached process of its own.
   */
  release(): void {
    ++this.generation; clearTimeout(this.timer); clearInterval(this.monitor); this.monitor = undefined
    const child = this.child; this.child = undefined
    // The worker stops supervising; the tunnel it started keeps running without it.
    if (child?.connected) child.send('detach', () => {})
    else child?.kill()
    this.url = undefined; this.phase = 'off'; this.adopted = undefined
    this.remaining = []; this.route = undefined
  }

  /** Close the connection. `keep` leaves the public address open for the next start to reuse. */
  async stop(keep = false): Promise<void> {
    if (keep) { this.release(); this.proxy?.destroy(); this.proxy = undefined; return }
    ++this.generation; clearTimeout(this.timer); clearInterval(this.monitor); this.monitor = undefined
    if (this.url) this.gateway.disallowAuthority(new URL(this.url).host)
    const child = this.child; this.child = undefined; this.url = undefined; this.phase = 'off'; this.failures = 0; this.warning = undefined
    this.unpublishedSince = 0; this.publishing = false
    this.remaining = []; this.route = undefined; this.allowReuse = false; this.revived = false; this.announced = undefined
    const proxy = this.proxy; this.proxy = undefined
    // An explicit stop ends the address itself, so a later start has to ask for a new one.
    this.drop()
    await Promise.all([this.closeChild(child), proxy?.destroy()])
  }
}
