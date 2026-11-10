/**
 * Completion reminders for the phone page, in two deliberately separate layers.
 *
 *  - In the page: a dot on the session row and a count in the tab title. Both work
 *    on any connection and without any browser permission.
 *  - Outside the page: a browser Notification and a short vibration. Best effort
 *    only: the API exists in a secure context (https, localhost) and needs the
 *    user's permission, and iOS Safari throws from `new Notification` unless the
 *    page is an installed app — so every call is guarded.
 *
 * The Host's own `completionUnread` flag cannot be trusted here: it is only raised
 * for a session the Host does *not* consider the main view (`isMain` in the Host's
 * session domain), and this page opens sessions, so the flag is cleared again as
 * soon as it is set. The dot therefore comes from `advanceUnread` in ./unread.ts,
 * which watches the status feed itself. `completionUnread` is still honoured when
 * the Host does raise it, but nothing depends on that.
 */
import * as React from 'react'
import { cachedText, cacheText, useStore, type Host } from './common.js'
import { advanceUnread, type StatusMap, type UnreadKind } from './unread.js'

export type { SessionStatusRow } from './unread.js'
export type { UnreadKind } from './unread.js'
const NOTIFY_KEY = 'dsrc-notify'
const TITLE_PREFIX = /^\(\d+\)\s*/

/** What this browser and this connection allow. */
export type NotificationSupport = 'ok' | 'unsupported' | 'insecure' | 'denied'

export function notificationSupport(): NotificationSupport {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 'unsupported'
  // A LAN page over plain http is not a secure context: Notification is absent there,
  // or present with a requestPermission that always rejects.
  if (window.isSecureContext === false) return 'insecure'
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return 'ok'
}

function granted(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted'
}

/** One notification, plus the haptic nudge that goes with it. Never throws. */
function fire(id: string, title: string, body: string, open: (id: string) => void): void {
  try { navigator.vibrate?.(60) } catch { /* no vibration on this browser */ }
  try {
    const shown = new Notification(title, { body, tag: `dsrc:${id}` })
    shown.onclick = () => {
      try { window.focus() } catch { /* the phone decides */ }
      try { open(id) } catch { /* ignore */ }
      try { shown.close() } catch { /* ignore */ }
    }
  } catch { /* iOS Safari refuses outside an installed app */ }
}

export interface NotifyOptions {
  ctx: Host
  /** The session on screen; it counts as read. */
  currentId: string | undefined
  /** A session's display name, for the notification title. */
  titleOf: (id: string) => string
  /** Bring a session to the screen (from a notification click). */
  onOpen: (id: string) => void
}

export interface NotifyState {
  /** Sessions with something to see that were not opened yet, and why. */
  unread: ReadonlyMap<string, UnreadKind>
  unreadCount: number
  enabled: boolean
  support: NotificationSupport
  /** Ask for the browser's permission (or turn reminders off again). */
  toggle: () => Promise<void>
}

export function useNotify({ ctx, currentId, titleOf, onOpen }: NotifyOptions): NotifyState {
  const statuses = useStore<StatusMap>(ctx?.uiSession?.sessionStatus)
  const rows: StatusMap | undefined = typeof (statuses as StatusMap | undefined)?.get === 'function' ? statuses : undefined
  const support = notificationSupport()
  const [enabled, setEnabled] = React.useState(() => support === 'ok' && cachedText(NOTIFY_KEY) === 'on' && granted())
  const [unread, setUnread] = React.useState<ReadonlyMap<string, UnreadKind>>(() => new Map())
  const list = React.useRef(unread)
  React.useEffect(() => { list.current = unread })

  const latest = React.useRef({ currentId, titleOf, onOpen, enabled })
  React.useEffect(() => { latest.current = { currentId, titleOf, onOpen, enabled } })

  const previous = React.useRef<StatusMap | undefined>(undefined)
  React.useEffect(() => {
    const before = previous.current
    previous.current = rows
    if (!rows) return
    const now = latest.current
    const { unread: next, news, changed } = advanceUnread(list.current, before, rows, now.currentId)
    if (changed) setUnread(next)
    // Only what happened after the page loaded is worth a popup, and only when it
    // is actually out of sight and the person asked for popups.
    if (!before || !news.length) return
    if (!now.enabled || notificationSupport() !== 'ok' || !document.hidden) return
    for (const item of news) {
      if (item.id === now.currentId) continue
      fire(item.id, now.titleOf(item.id), item.kind === 'waiting' ? '正在等你处理' : '已完成，点开看看结果', now.onOpen)
    }
    // Opening a session clears its dot, which can happen without the feed emitting
    // anything new, so the session on screen is part of this effect's inputs.
  }, [rows, currentId])

  // The tab title counts what the drawer shows. The base title belongs to whoever
  // wrote it (renderIndex says "DSH · 远程"), so it is read back, never assumed.
  const count = unread.size
  React.useEffect(() => {
    const base = document.title.replace(TITLE_PREFIX, '') || 'DSH · 远程'
    document.title = count > 0 ? `(${count}) ${base}` : base
    return () => { document.title = base }
  }, [count])

  const toggle = React.useCallback(async () => {
    if (enabled) { setEnabled(false); cacheText(NOTIFY_KEY, 'off'); return }
    if (notificationSupport() !== 'ok') return
    try { await Notification.requestPermission() } catch { /* old browsers want a callback; read the permission below */ }
    const allowed = granted()
    setEnabled(allowed)
    cacheText(NOTIFY_KEY, allowed ? 'on' : 'off')
  }, [enabled])

  return { unread, unreadCount: count, enabled, support, toggle }
}

/** The one line the settings page shows under the reminders switch. */
export function notifyHint(support: NotificationSupport, enabled: boolean): string {
  if (support === 'insecure') return '局域网 http 下浏览器不允许通知（不是插件的问题）。换成任意 https 的网络连接即可；页内小圆点和页签计数照常工作，不影响使用。'
  if (support === 'unsupported') return '这个浏览器没有通知接口；页内小圆点和页签标题计数仍然有效。'
  if (support === 'denied') return '浏览器已禁止本站通知；在浏览器设置里允许后再点一次。'
  if (enabled) return '会话在后台完成或等你处理时会弹一条通知，并轻震一下；点通知回到那个会话。'
  return '开启后，会话在后台完成或等你处理时弹一条通知；页内小圆点和页签计数不用开启也有效。'
}
