/**
 * The rule behind the dots, kept away from React so it can be tested directly.
 *
 * Why it exists at all: the Host publishes a `completionUnread` flag, but it only
 * raises it for a session that is *not* its main view, and this page opens sessions,
 * so the flag is cleared again as soon as it is set. The dot therefore comes from
 * watching the status feed itself: a session seen running and then not running has
 * finished, and a session waiting for an answer is waiting for one.
 */

/** One row of the Host's unified session status snapshot. */
export interface SessionStatusRow {
  running?: boolean | undefined
  pendingInteraction?: unknown
  completionUnread?: boolean | undefined
}
export type StatusMap = ReadonlyMap<string, SessionStatusRow>
/** Why a session sits on the list: it finished, or it is waiting for the person. */
export type UnreadKind = 'done' | 'waiting'
export interface UnreadNews {
  id: string
  kind: UnreadKind
}

export interface Advanced {
  /** The dots to draw, after this snapshot. */
  unread: Map<string, UnreadKind>
  /** Dots that appeared in this snapshot: what a popup is for. */
  news: UnreadNews[]
  /** Whether anything a person would notice changed. */
  changed: boolean
}

/**
 * Fold one status snapshot into the dot list.
 *
 * @param previous  the dots before this snapshot
 * @param before    the status snapshot before this one, `undefined` on first load
 * @param rows      the current status snapshot
 * @param currentId the session on screen; it always counts as read
 */
export function advanceUnread(
  previous: ReadonlyMap<string, UnreadKind>,
  before: StatusMap | undefined,
  rows: StatusMap,
  currentId: string | undefined,
): Advanced {
  const unread = new Map(previous)
  const news: UnreadNews[] = []
  // A session that left the list cannot stay on it.
  for (const id of unread.keys()) if (!rows.has(id)) unread.delete(id)
  rows.forEach((row, id) => {
    // On screen: read, whatever the row says.
    if (id === currentId) { unread.delete(id); return }
    const was = before?.get(id)
    // Waiting for an answer outranks everything: it is what needs the person, and a
    // run parked on a question can keep reporting `running: true`, so this has to be
    // checked before the running test below.
    if (row?.pendingInteraction) {
      if (before && !was?.pendingInteraction) news.push({ id, kind: 'waiting' })
      unread.set(id, 'waiting')
      return
    }
    if (row?.running === true) { unread.delete(id); return }
    if (!before) { if (row?.completionUnread) unread.set(id, 'done'); return }
    const finished = was?.running === true || (!!row?.completionUnread && !was?.completionUnread)
    if (!finished) return
    if (unread.get(id) !== 'done') news.push({ id, kind: 'done' })
    unread.set(id, 'done')
  })
  const changed = unread.size !== previous.size || [...unread].some(([id, kind]) => previous.get(id) !== kind)
  return { unread, news, changed }
}
