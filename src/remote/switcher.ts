/**
 * The chip that says which computer this phone is talking to, and the sheet that moves it to
 * another one.
 *
 * A switch is a navigation: the browser keeps one authorization per address, and the link carries
 * this phone's list so the computer being opened learns about the others.
 */
import * as React from 'react'
import { Icon } from './icons.js'
import { useBackClose } from './common.js'
import { ask, confirmAction } from './dialog.js'
import { canScan, forget, hostName, hosts, labelOf, originOf, pairURL, parseLink, remember, rename, switchURL, type KnownHost } from './hosts.js'
const h = React.createElement

/** Records the computer this page is on, so the list always knows where the phone is. */
export function rememberCurrent(host?: { id?: string; label?: string }): void {
  const base = originOf(location.origin)
  if (base) remember({ i: host?.id, l: host?.label, b: base })
}

export function currentBase(): string { return originOf(location.origin) }

/** The computer the phone would go to first when the current one cannot be reached. */
export function otherHost(): KnownHost | undefined {
  const base = currentBase()
  return hosts().find(host => host.b !== base)
}

function visit(base: string, token?: string): void {
  location.href = token ? pairURL(base, token) : switchURL(base)
}

interface Decoded { rawValue?: string }

/** Reads a QR code with the camera; only a secure page may ask for one, so the row is offered when it can. */
function Scanner({ onResult, onClose }: { onResult: (value: string) => void; onClose: () => void }): React.ReactElement {
  const video = React.useRef<HTMLVideoElement>(null), [error, setError] = React.useState('')
  useBackClose(true, onClose)
  React.useEffect(() => {
    let stopped = false, timer = 0, stream: MediaStream | undefined
    const start = async () => {
      try {
        const scope = globalThis as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: unknown) => Promise<Decoded[]> } }
        if (!scope.BarcodeDetector || !navigator.mediaDevices) { setError('这个浏览器不能直接扫码。请手动粘贴链接。'); return }
        const detector = new scope.BarcodeDetector({ formats: ['qr_code'] })
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (stopped || !video.current) { stream.getTracks().forEach(track => track.stop()); return }
        video.current.srcObject = stream
        await video.current.play()
        const tick = async () => {
          if (stopped || !video.current) return
          try {
            const codes = await detector.detect(video.current)
            const value = codes[0]?.rawValue
            if (typeof value === 'string' && value) { onResult(value); return }
          } catch { /* a frame without a code */ }
          timer = window.setTimeout(tick, 350)
        }
        timer = window.setTimeout(tick, 350)
      } catch { setError('无法打开相机。请手动粘贴链接。') }
    }
    void start()
    return () => { stopped = true; window.clearTimeout(timer); stream?.getTracks().forEach(track => track.stop()) }
  }, [])
  return h('dialog', { className: 'rc-dialog rc-scan', open: true, onCancel: (event: React.SyntheticEvent) => { event.preventDefault(); onClose() } },
    h('div', { className: 'rc-scan-body' },
      h('h2', null, '扫描电脑上的二维码'),
      error ? h('p', { className: 'rc-dialog-message' }, error) : null,
      error ? null : h('video', { ref: video, className: 'rc-scan-video', muted: true, playsInline: true }),
      h('div', { className: 'rc-actions' }, h('button', { type: 'button', onClick: onClose }, '取消')))
  )
}

export function HostChip({ label }: { label: string }): React.ReactElement {
  const [open, setOpen] = React.useState(false), [list, setList] = React.useState<KnownHost[]>(() => hosts())
  const [notice, setNotice] = React.useState(''), [error, setError] = React.useState(''), [scanning, setScanning] = React.useState(false)
  const dialog = React.useRef<HTMLDialogElement>(null)
  React.useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) { setList(hosts()); setError(''); setNotice(''); element.showModal() }
    if (!open && element.open) element.close()
  }, [open])
  useBackClose(open, () => setOpen(false))
  const base = currentBase()
  const adopt = (value: string) => {
    const parsed = parseLink(value)
    if (!parsed) { setError('没有认出这个地址。请粘贴电脑上显示的完整链接。'); return }
    // Remembered before the page changes: this origin keeps the entry even if the other computer
    // turns out not to authorize this phone yet.
    remember({ b: parsed.base }); setList(hosts()); setError('')
    visit(parsed.base, parsed.token)
  }
  const add = async () => {
    const value = await ask('粘贴另一台电脑的配对链接，或者它的地址', '')
    if (value !== null) adopt(value)
  }
  const share = async (host: KnownHost) => {
    try { await navigator.clipboard.writeText(switchURL(host.b)); setNotice('完整地址已复制，可以发给别的手机或浏览器。') } catch { setNotice('复制失败，请长按下面的地址。') }
  }
  const rows = list.map(host => h('button', {
    key: host.b, type: 'button', role: 'option', className: 'rc-picker-option', 'aria-selected': host.b === base,
    onClick: () => { if (host.b !== base) visit(host.b) },
  },
  h('span', { className: 'rc-picker-label' }, labelOf(host), h('small', null, `${hostName(host.b)}${host.b === base ? ' · 正在使用' : ''}`)),
  host.b === base ? h(Icon, { name: 'check' }) : h(Icon, { name: 'chevron' })))

  const manage = list.map(host => h('div', { key: host.b, className: 'rc-hosts-row' },
    h('span', { className: 'rc-hosts-name' }, labelOf(host)),
    h('button', { type: 'button', className: 'rc-text', onClick: () => { void ask('这台电脑在你手机上的名字', labelOf(host)).then(value => { if (value !== null) setList(rename(host.b, value)) }) } }, '重命名'),
    h('button', { type: 'button', className: 'rc-text', onClick: () => { void share(host) } }, '复制地址'),
    host.b === base ? null : h('button', { type: 'button', className: 'rc-text rc-danger', onClick: () => { void confirmAction(`移除「${labelOf(host)}」？这台电脑的授权仍然保留，只是不再出现在这个列表里。`).then(yes => { if (yes) setList(forget(host.b)) }) } }, '移除')))

  const body = h('div', { className: 'rc-picker-body' },
    h('div', { className: 'rc-picker-title' }, '我的电脑'),
    h('div', { className: 'rc-picker-list', role: 'listbox', 'aria-label': '我的电脑' },
      ...rows,
      h('button', { type: 'button', className: 'rc-picker-option rc-picker-more', onClick: () => { setOpen(false); void add() } },
        h('span', { className: 'rc-picker-label' }, '添加另一台电脑'), h(Icon, { name: 'plus' })),
      canScan() ? h('button', { type: 'button', className: 'rc-picker-option rc-picker-more', onClick: () => { setOpen(false); setScanning(true) } },
        h('span', { className: 'rc-picker-label' }, '扫描电脑上的二维码'), h(Icon, { name: 'chevron' })) : null),
    error ? h('div', { className: 'rc-notice' }, error) : null,
    notice ? h('div', { className: 'rc-notice' }, notice) : null,
    h('div', { className: 'rc-picker-title' }, '管理'),
    ...manage,
    h('div', { className: 'rc-hosts-note' }, '换电脑只是切换正在看的这台；每台电脑上的会话和文件各自独立。'))

  return h(React.Fragment, null,
    h('button', { type: 'button', className: 'rc-host-chip', 'aria-haspopup': 'dialog', title: '切换电脑', onClick: () => setOpen(true) },
      h('span', { className: 'rc-host-chip-name' }, label), h(Icon, { name: 'chevronDown' })),
    h('dialog', { ref: dialog, className: 'rc-picker-sheet', 'aria-label': '我的电脑', onCancel: () => setOpen(false), onClose: () => setOpen(false),
      onClick: (event: React.MouseEvent) => { if (event.target === event.currentTarget) setOpen(false) } },
      open ? body : null),
    scanning ? h(Scanner, { onClose: () => setScanning(false), onResult: value => { setScanning(false); adopt(value) } }) : null
  )
}
