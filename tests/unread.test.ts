import { describe, expect, it } from 'vitest'
import { advanceUnread, type SessionStatusRow, type UnreadKind } from '../src/remote/unread.js'

const map = (rows: Record<string, SessionStatusRow>) => new Map(Object.entries(rows))
const dots = (entries: Array<[string, UnreadKind]>) => new Map(entries)

describe('the dot a finished session leaves in the list', () => {
  it('appears when a session the page watched running stops running', () => {
    const before = map({ a: { running: true } })
    const step = advanceUnread(new Map(), before, map({ a: { running: false } }), 'b')
    expect([...step.unread]).toEqual([['a', 'done']])
    expect(step.news).toEqual([{ id: 'a', kind: 'done' }])
    expect(step.changed).toBe(true)
  })

  it('does not appear for a session that was already idle when the page loaded', () => {
    const step = advanceUnread(new Map(), undefined, map({ a: { running: false } }), 'b')
    expect(step.unread.size).toBe(0)
    expect(step.news).toEqual([])
    expect(step.changed).toBe(false)
  })

  it('reappears when a session that was opened runs again and finishes again', () => {
    // Opened, so the dot is gone; then it runs and stops again.
    const step = advanceUnread(new Map(), map({ a: { running: true } }), map({ a: { running: false } }), 'b')
    expect([...step.unread]).toEqual([['a', 'done']])
    expect(step.news).toEqual([{ id: 'a', kind: 'done' }])
  })

  it('is never drawn on the session a person is looking at', () => {
    const step = advanceUnread(new Map(), map({ a: { running: true } }), map({ a: { running: false } }), 'a')
    expect(step.unread.size).toBe(0)
    expect(step.news).toEqual([])
  })

  it('goes away when that session is opened, even if the feed says nothing new', () => {
    const listed = dots([['a', 'done']])
    const step = advanceUnread(listed, map({ a: { running: false } }), map({ a: { running: false } }), 'a')
    expect(step.unread.size).toBe(0)
    expect(step.changed).toBe(true)
  })

  it('goes away when the session runs again', () => {
    const step = advanceUnread(dots([['a', 'done']]), map({ a: { running: false } }), map({ a: { running: true } }), 'b')
    expect(step.unread.size).toBe(0)
    expect(step.changed).toBe(true)
  })

  it('goes away when the session leaves the list', () => {
    const step = advanceUnread(dots([['a', 'done']]), map({ a: { running: false } }), map({}), 'b')
    expect(step.unread.size).toBe(0)
    expect(step.changed).toBe(true)
  })
})

describe('the dot a session waiting for you leaves', () => {
  it('is the waiting kind, even while the run still reports running', () => {
    const before = map({ a: { running: true } })
    const step = advanceUnread(new Map(), before, map({ a: { running: true, pendingInteraction: { kind: 'approval' } } }), 'b')
    expect([...step.unread]).toEqual([['a', 'waiting']])
    expect(step.news).toEqual([{ id: 'a', kind: 'waiting' }])
  })

  it('is only announced once, not on every snapshot', () => {
    const first = map({ a: { running: false, pendingInteraction: { kind: 'approval' } } })
    const step = advanceUnread(dots([['a', 'waiting']]), first, first, 'b')
    expect(step.news).toEqual([])
    expect([...step.unread]).toEqual([['a', 'waiting']])
    expect(step.changed).toBe(false)
  })

  it('outranks finished when the same snapshot raises both', () => {
    const before = map({ a: { running: true } })
    const step = advanceUnread(new Map(), before, map({ a: { running: false, pendingInteraction: { kind: 'question' }, completionUnread: true } }), 'b')
    expect([...step.unread]).toEqual([['a', 'waiting']])
  })

  it('stays waiting while the answer is being given, and clears on open', () => {
    const waiting = dots([['a', 'waiting']])
    const step = advanceUnread(waiting, map({ a: { pendingInteraction: {} } }), map({ a: { pendingInteraction: {} } }), 'a')
    expect(step.unread.size).toBe(0)
  })
})

describe('the Host flag, when it does arrive', () => {
  it('is honoured on the first snapshot', () => {
    const step = advanceUnread(new Map(), undefined, map({ a: { completionUnread: true } }), 'b')
    expect([...step.unread]).toEqual([['a', 'done']])
    expect(step.news).toEqual([])
  })

  it('is honoured when it flips, but is not required', () => {
    const step = advanceUnread(new Map(), map({ a: {} }), map({ a: { completionUnread: true } }), 'b')
    expect([...step.unread]).toEqual([['a', 'done']])
    expect(step.news).toEqual([{ id: 'a', kind: 'done' }])
  })
})
