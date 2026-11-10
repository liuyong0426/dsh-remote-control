/**
 * A stable name for this computer.
 *
 * One phone may be authorized on two computers, or on two DSH profiles of one computer, and the
 * phone has to tell them apart in a short chip. The name lives beside the device authorizations:
 * losing the file costs the name only, never a pairing.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'

export interface Identity { id: string; label: string }
/** Long enough for a room or a desk name, short enough for a phone's chip. */
export const LABEL_MAX = 40

/** Control characters would break a chip's layout; runs of spaces only pad it. */
export function cleanLabel(value: unknown): string {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LABEL_MAX)
}

/** The name a computer offers before anyone renames it: its host name, and the profile when it is not the only one. */
export function defaultLabel(computer: string, profile: string): string {
  const name = cleanLabel(computer) || 'DSH'
  return profile && profile !== 'default' ? cleanLabel(`${name} · ${profile}`) || name : name
}

export function saveIdentity(file: string, identity: Identity): void {
  const temporary = `${file}.${randomUUID()}.tmp`
  writeFileSync(temporary, JSON.stringify({ version: 1, id: identity.id, label: identity.label }), { mode: 0o600 })
  renameSync(temporary, file)
}

export function loadIdentity(file: string, fallback: string): Identity {
  const fresh = (): Identity => ({ id: randomUUID(), label: cleanLabel(fallback) || 'DSH' })
  if (!existsSync(file)) {
    const identity = fresh()
    try { saveIdentity(file, identity) } catch { /* a read-only home still works, with a new name each start */ }
    return identity
  }
  try {
    const stored = JSON.parse(readFileSync(file, 'utf8')) as { id?: unknown; label?: unknown }
    const id = typeof stored.id === 'string' && stored.id.length >= 8 && stored.id.length <= 64 ? stored.id : ''
    if (!id) throw new Error('missing id')
    return { id, label: cleanLabel(stored.label) || cleanLabel(fallback) || 'DSH' }
  } catch {
    // A damaged name file must not keep the plugin from loading; device authorizations live elsewhere.
    const identity = fresh()
    try { saveIdentity(file, identity) } catch { /* see above */ }
    return identity
  }
}
