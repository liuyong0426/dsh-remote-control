import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * The cloudflared binary, and how it is fetched.
 *
 * This module deliberately does not use untun to open the tunnel: untun always spawns cloudflared as
 * a child of its own caller and kills it from there, so the address dies with the Host and the next
 * start hands the phone a new one. `tunnel-worker.ts` starts the binary itself, detached, so the
 * address survives a restart and the devices that were paired on it keep working. Only the download
 * is shared, and it is the same release asset untun would fetch, in the same folder.
 */
export const CLOUDFLARED_VERSION = process.env.CLOUDFLARED_VERSION || '2026.7.2'
const RELEASE = 'https://github.com/cloudflare/cloudflared/releases/'
const ASSETS: Record<string, Record<string, string>> = {
  win32: { x64: 'cloudflared-windows-amd64.exe', ia32: 'cloudflared-windows-386.exe' },
  linux: { x64: 'cloudflared-linux-amd64', arm64: 'cloudflared-linux-arm64', arm: 'cloudflared-linux-arm', ia32: 'cloudflared-linux-386' },
  darwin: { x64: 'cloudflared-darwin-amd64.tgz', arm64: 'cloudflared-darwin-amd64.tgz' },
}
/** Where the binary lives. The folder is shared with untun, so an existing download is reused. */
export function cloudflaredPath(version = CLOUDFLARED_VERSION): string {
  return join(tmpdir(), 'node-untun', process.platform === 'win32' ? `cloudflared.${version}.exe` : `cloudflared.${version}`)
}
export function cloudflaredInstalled(path = cloudflaredPath()): boolean {
  return existsSync(path)
}
/** Download the release asset for this platform; `version` may be `latest`. */
export async function installCloudflared(path = cloudflaredPath(), version = CLOUDFLARED_VERSION): Promise<string> {
  const asset = ASSETS[process.platform]?.[process.arch]
  if (!asset) throw new Error(`cloudflared 没有适用于 ${process.platform}/${process.arch} 的版本。`)
  const base = version === 'latest' ? `${RELEASE}latest/download/` : `${RELEASE}download/${version}/`
  const response = await fetch(base + asset, { redirect: 'follow' })
  if (!response.ok) throw new Error(`cloudflared 下载失败（HTTP ${response.status}）。`)
  const body = Buffer.from(await response.arrayBuffer())
  if (body.length < 1_000_000) throw new Error('cloudflared 下载到的文件不完整。')
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.download`
  writeFileSync(temporary, body)
  if (asset.endsWith('.tgz')) {
    // The macOS release is a tarball holding one binary named `cloudflared`.
    execFileSync('tar', ['-xzf', temporary, '-C', dirname(path)])
    unlinkSync(temporary)
    renameSync(join(dirname(path), 'cloudflared'), path)
  } else renameSync(temporary, path)
  if (process.platform !== 'win32') chmodSync(path, 0o755)
  return readFileSync(path).length > 0 ? path : ''
}
