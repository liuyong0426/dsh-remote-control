import { closeSync, fstatSync, openSync, readSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { cloudflaredInstalled, cloudflaredPath, installCloudflared } from './cloudflared.js'

/**
 * Starts cloudflared and hands its address back to the TunnelManager.
 *
 * The tunnel is started detached and writes to a log file instead of a pipe, because the address has
 * to outlive the Host: a phone's authorization cookie belongs to that address, so a new address after
 * every restart would mean scanning a new code every time. This worker only supervises the start,
 * reports the address, and stops supervising when the Host goes away — it never kills the tunnel on
 * its own. A tunnel that is still there on the next run is reused by the manager.
 */
const port = Number(process.env.DSH_RC_TUNNEL_PORT)
const stateFile = process.env.DSH_RC_TUNNEL_STATE || ''
const logFile = process.env.DSH_RC_TUNNEL_LOG || ''
let stopped = false
let pid: number | undefined
let address: string | undefined

const send = (value: unknown) => { if (process.connected) process.send?.(value) }
const remember = () => {
  if (!stateFile || !pid || !address) return
  try { const temporary = `${stateFile}.${process.pid}.tmp`; writeFileSync(temporary, JSON.stringify({ pid, url: address, port, at: Date.now() }), { mode: 0o600 }); renameSync(temporary, stateFile) } catch { /* the manager keeps its own copy */ }
}
const kill = (target: number) => {
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(target), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  else { try { process.kill(target, 'SIGKILL') } catch { /* already gone */ } }
}
/** Leave the tunnel running: this process is only its supervisor. */
const leave = () => { process.exit(0) }
/** End the tunnel itself, for an explicit "stop". */
const close = () => {
  stopped = true
  try { if (stateFile) writeFileSync(stateFile, '{}') } catch { /* nothing kept */ }
  if (pid) kill(pid)
  process.exit(0)
}
process.on('message', message => { if (message === 'stop') close(); else if (message === 'detach') leave() })
// The Host's own exit must not take the address with it.
process.on('disconnect', leave)

/**
 * The address appears on cloudflared's own banner, inside a box drawn with `|`. `from` is where this
 * run's output begins: the log is appended to, so an address printed by an earlier run sits above it.
 */
const readAddress = (from: number): string | undefined => {
  if (!logFile) return undefined
  let fd: number | undefined
  try {
    fd = openSync(logFile, 'r')
    const end = fstatSync(fd).size
    const begin = Math.max(from, end - 65536)
    const length = Math.max(end - begin, 0)
    if (!length) return undefined
    const buffer = Buffer.alloc(length)
    const size = readSync(fd, buffer, 0, length, begin)
    const found = [...buffer.subarray(0, size).toString('utf8').matchAll(/\|\s+(https?:\/\/\S+?)\s*\|/g)].at(-1)
    return found?.[1]
  } catch { return undefined } finally { if (fd !== undefined) try { closeSync(fd) } catch { /* closed */ } }
}

const wait = (ms: number) => new Promise<void>(resolve => { setTimeout(resolve, ms) })

try {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('网关端口不正确。')
  const binary = cloudflaredPath()
  if (!cloudflaredInstalled(binary)) {
    send({ phase: 'downloading' })
    await installCloudflared(binary)
  }
  send({ phase: 'starting' })
  const args = ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-tls-verify', '--no-autoupdate']
  // Appended to, not truncated: a tunnel that drops in the night leaves its evidence in the log.
  // The address is read from the tail, so an address from an earlier run still cannot be mistaken
  // for this one's. The file is rolled over when it grows past a couple of megabytes.
  if (logFile) { try { if (statSync(logFile).size > 2_000_000) renameSync(logFile, `${logFile}.1`) } catch { /* no log yet */ } }
  // Everything above this mark belongs to earlier runs; only what follows it can be this run's address.
  const mark = (() => { if (!logFile) return 0; try { return statSync(logFile).size } catch { return 0 } })()
  const out = logFile ? openSync(logFile, 'a') : 'ignore'
  const child = spawn(binary, args, { detached: true, windowsHide: true, stdio: ['ignore', out, out] })
  if (logFile && typeof out === 'number') try { closeSync(out) } catch { /* the child keeps it */ }
  child.on('error', () => { send({ phase: 'error', error: '无法启动 cloudflared，请检查下载网络和 Cloudflare 可达性。' }); process.exit(1) })
  child.on('exit', code => {
    if (stopped) return
    send({ phase: 'error', error: address ? '远程隧道已结束，请重新开启。' : `cloudflared 启动失败（退出码 ${code ?? '未知'}）。` })
    process.exit(1)
  })
  pid = child.pid
  child.unref()
  if (!pid) throw new Error('cloudflared 没有启动。')
  for (let waited = 0; waited < 120_000 && !stopped; waited += 250) {
    await wait(250)
    const found = readAddress(mark)
    if (!found || found === address) continue
    address = found
    remember()
    send({ phase: 'url', url: address, pid })
    break
  }
  if (!address) throw new Error('cloudflared 没有返回远程地址。')
} catch (failure) {
  const message = failure instanceof Error ? failure.message : ''
  send({ phase: 'error', error: message ? `连接通道启动失败：${message}` : '连接通道启动失败。' })
  if (pid) kill(pid)
  process.exit(1)
}
