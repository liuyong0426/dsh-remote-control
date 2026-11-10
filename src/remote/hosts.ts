/**
 * The computers this phone has been authorized on.
 *
 * Browser storage belongs to one origin, so a phone that can reach two computers keeps one list per
 * computer. Lists are merged whenever the phone moves between them: the link that opens the other
 * computer carries this list, and that computer adds it to its own. Nothing is authorized by a
 * list — an entry only becomes usable after the usual on-computer pairing.
 *
 * boot.ts and pages.ts read the same storage from inline scripts and cannot import this module, so
 * they repeat the key; tests/identity.test.ts keeps the three copies in step.
 */
export const HOSTS_KEY = 'dsrc-hosts'
export const HOSTS_MAX = 24
const ALIAS_MAX = 40
const PAYLOAD_MAX = 4096

export interface KnownHost {
  /** The computer's own id, empty when this entry came from a link only. */
  i: string
  /** The name the computer gave itself. */
  l: string
  /** Origin, such as https://abc.trycloudflare.com or http://192.168.1.5:53279. */
  b: string
  /** What this phone calls it, when the two names differ. */
  a?: string
  /** When this phone last opened it, in milliseconds. */
  t?: number
}

/** An origin, or an empty string for anything that is not a plain http(s) address. */
export function originOf(value: unknown): string {
  try {
    const url = new URL(String(value ?? ''))
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
    if (url.username || url.password) return ''
    return url.origin
  } catch {
    return ''
  }
}

function text(value: unknown, max: number): string {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : undefined
}

/** Keeps the newest entry for each origin, so a host that changed address does not appear twice. */
function tidy(entries: KnownHost[]): KnownHost[] {
  const byBase = new Map<string, KnownHost>()
  for (const entry of entries) {
    const previous = byBase.get(entry.b)
    if (!previous || (entry.t ?? 0) > (previous.t ?? 0)) byBase.set(entry.b, entry)
  }
  const list = [...byBase.values()]
  const byId = new Map<string, KnownHost>()
  for (const entry of list) {
    if (!entry.i) continue
    const previous = byId.get(entry.i)
    if (!previous) { byId.set(entry.i, entry); continue }
    // Two origins claiming one computer: the address that answered last wins, and the other goes.
    const keep = (entry.t ?? 0) > (previous.t ?? 0) ? entry : previous
    byId.set(entry.i, keep)
    const drop = keep === entry ? previous : entry
    const index = list.indexOf(drop)
    if (index >= 0) list.splice(index, 1)
  }
  return list.sort((a, b) => (b.t ?? 0) - (a.t ?? 0)).slice(0, HOSTS_MAX)
}

function parse(raw: string | null): KnownHost[] {
  if (!raw) return []
  try {
    const value = JSON.parse(raw) as unknown
    if (!Array.isArray(value)) return []
    const entries: KnownHost[] = []
    for (const item of value) {
      if (!item || typeof item !== 'object') continue
      const entry = item as Record<string, unknown>
      const base = originOf(entry.b)
      if (!base) continue
      const known: KnownHost = { i: text(entry.i, 64), l: text(entry.l, ALIAS_MAX), b: base }
      const alias = text(entry.a, ALIAS_MAX)
      if (alias) known.a = alias
      const seen = number(entry.t)
      if (seen) known.t = seen
      entries.push(known)
    }
    return tidy(entries)
  } catch {
    return []
  }
}

// Storage can be unavailable (a private window, a full quota); the list then lives for this page only.
let fallback: string | null = null

function read(): string | null {
  try {
    const value = localStorage.getItem(HOSTS_KEY)
    return value ?? fallback
  } catch {
    return fallback
  }
}

function store(raw: string): void {
  fallback = raw
  try { localStorage.setItem(HOSTS_KEY, raw) } catch { /* see above */ }
}

export function hosts(): KnownHost[] {
  return parse(read())
}

export function write(list: KnownHost[]): void {
  store(JSON.stringify(tidy(list)))
}

/** The name to show on a chip: the phone's own name when it has one, else the computer's. */
export function labelOf(host: KnownHost): string {
  return host.a || host.l || hostName(host.b) || '这台电脑'
}

/** What the address itself says, used as a last resort before the computer has introduced itself. */
export function hostName(base: string): string {
  try { return new URL(base).host } catch { return '' }
}

export function find(key: string): KnownHost | undefined {
  const base = originOf(key)
  return hosts().find(host => (base ? host.b === base : host.i === key))
}

/** Records that this phone is on `base`, keeping any name the phone gave it. */
export function remember(entry: { i?: string; l?: string; b: string }): KnownHost[] {
  const base = originOf(entry.b)
  if (!base) return hosts()
  const list = hosts()
  const id = text(entry.i, 64)
  const label = text(entry.l, ALIAS_MAX)
  // Two visits inside one millisecond must still order correctly: "newest first" decides which of a
  // computer's addresses is kept, so the clock is nudged forward instead of trusting Date.now alone.
  const now = Math.max(Date.now(), ...list.map(host => (host.t ?? 0) + 1))
  const existing = list.find(host => host.b === base) ?? (id ? list.find(host => host.i === id) : undefined)
  if (existing) {
    existing.b = base
    if (id) existing.i = id
    if (label) existing.l = label
    existing.t = now
  } else {
    list.push({ i: id, l: label, b: base, t: now })
  }
  const next = tidy(list)
  write(next)
  return next
}

export function forget(key: string): KnownHost[] {
  const base = originOf(key)
  const list = hosts().filter(host => (base ? host.b !== base : host.i !== key))
  write(list)
  return list
}

/** A phone-local name; an empty name falls back to the computer's own. */
export function rename(key: string, alias: string): KnownHost[] {
  const base = originOf(key)
  const list = hosts()
  for (const host of list) {
    if (base ? host.b === base : host.i === key) {
      const name = text(alias, ALIAS_MAX)
      if (name && name !== host.l) host.a = name
      else delete host.a
    }
  }
  write(list)
  return hosts()
}

function encode(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decode(value: string): unknown {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

/** This phone's list, as it travels in a link. Addresses only: names the phone gave are its own. */
export function payload(): string {
  const entries = hosts().map(host => ({ i: host.i, l: host.l, b: host.b }))
  return encode(entries)
}

/** Adds every computer from a link, keeping the names this phone already uses. Returns the new list. */
export function merge(value: string | null | undefined): KnownHost[] {
  const raw = String(value ?? '')
  if (!raw || raw.length > PAYLOAD_MAX) return hosts()
  let incoming: unknown
  try { incoming = decode(raw) } catch { return hosts() }
  if (!Array.isArray(incoming)) return hosts()
  const list = hosts()
  for (const item of incoming) {
    if (!item || typeof item !== 'object') continue
    const entry = item as Record<string, unknown>
    const base = originOf(entry.b)
    if (!base) continue
    const id = text(entry.i, 64)
    const label = text(entry.l, ALIAS_MAX)
    const existing = list.find(host => host.b === base) ?? (id ? list.find(host => host.i === id) : undefined)
    if (existing) {
      existing.b = base
      if (id) existing.i = id
      if (label) existing.l = label
      continue
    }
    list.push({ i: id, l: label, b: base })
  }
  write(list)
  return hosts()
}

/** A link to another computer that also teaches it about this one. */
export function switchURL(base: string): string {
  const origin = originOf(base)
  return `${origin || base}/?rcfrom=${payload()}`
}

/** The same, for a computer that has not authorized this phone yet: pairing first, list second. */
export function pairURL(base: string, token: string): string {
  const origin = originOf(base)
  return `${origin || base}/pair?rcfrom=${payload()}#pair=${encodeURIComponent(token)}`
}

const PRIVATE = /^(?:10\.|127\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|169\.254\.|localhost$|\[::1\])/

/** Reads a pairing link, a bare address, or something a camera saw. */
export function parseLink(value: string): { base: string; token?: string } | null {
  const input = text(value, 2048)
  if (!input) return null
  let candidate = input
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    const host = candidate.split(/[/?#]/)[0] ?? ''
    candidate = `${PRIVATE.test(host.toLowerCase()) ? 'http' : 'https'}://${candidate}`
  }
  let url: URL
  try { url = new URL(candidate) } catch { return null }
  const base = originOf(url.origin)
  if (!base) return null
  let token = new URLSearchParams(url.hash.replace(/^#/, '')).get('pair') ?? url.searchParams.get('pair') ?? ''
  if (!token) {
    // A QR code may carry the whole pairing address; the token is the only part worth keeping.
    const found = /[#&?]pair=([^&\s]+)/.exec(input)
    if (found) token = decodeURIComponent(found[1] ?? '')
  }
  return token ? { base, token } : { base }
}

/** Whether this page can read a QR code itself; a plain LAN address cannot use the camera. */
export function canScan(): boolean {
  const scope = globalThis as unknown as { isSecureContext?: boolean; BarcodeDetector?: unknown }
  const media = (globalThis as unknown as { navigator?: { mediaDevices?: { getUserMedia?: unknown } } }).navigator
  return Boolean(scope.isSecureContext && scope.BarcodeDetector && media?.mediaDevices?.getUserMedia)
}
