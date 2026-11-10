import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ADOPT_SCRIPT, BOOT_SCRIPT, injectBoot } from '../src/boot.js'
import { cleanLabel, defaultLabel, loadIdentity, saveIdentity } from '../src/identity.js'
import { deniedPage, pairingPage } from '../src/pages.js'
import { HOSTS_KEY, HOSTS_MAX, hosts, merge, originOf, pairURL, parseLink, payload, remember, rename, switchURL, write } from '../src/remote/hosts.js'

const folder = () => mkdtempSync(join(tmpdir(), 'dsh-rc-identity-'))

describe('the name a computer gives itself', () => {
  it('keeps a short, printable label and falls back to the computer name', () => {
    expect(cleanLabel('  台式机\u0000  家里  ')).toBe('台式机 家里')
    expect(cleanLabel('x'.repeat(80)).length).toBe(40)
    expect(cleanLabel(null)).toBe('')
    expect(defaultLabel('DESKTOP-1', 'default')).toBe('DESKTOP-1')
    expect(defaultLabel('DESKTOP-1', 'work')).toBe('DESKTOP-1 · work')
  })

  it('creates the file once, then reads the same identity back', () => {
    const file = join(folder(), 'host.json')
    const created = loadIdentity(file, 'DESKTOP-1 · work')
    expect(created.id.length).toBeGreaterThanOrEqual(8)
    expect(created.label).toBe('DESKTOP-1 · work')
    // The id is what a phone uses to tell two computers apart, so it must survive a restart.
    expect(loadIdentity(file, 'other')).toEqual(created)
    const renamed = { ...created, label: '家里的电脑' }
    saveIdentity(file, renamed)
    expect(loadIdentity(file, 'other')).toEqual(renamed)
  })

  it('recovers from a damaged file instead of failing to load', () => {
    const file = join(folder(), 'host.json')
    writeFileSync(file, '{"id": "short"')
    const recovered = loadIdentity(file, 'DESKTOP-1')
    expect(recovered.id.length).toBeGreaterThanOrEqual(8)
    expect(JSON.parse(readFileSync(file, 'utf8')).label).toBe('DESKTOP-1')
  })
})

describe('the computers a phone remembers', () => {
  it('accepts plain http(s) addresses only', () => {
    expect(originOf('https://abc.trycloudflare.com/pair?x=1')).toBe('https://abc.trycloudflare.com')
    expect(originOf('http://192.168.1.5:53279/')).toBe('http://192.168.1.5:53279')
    expect(originOf('ftp://192.168.1.5')).toBe('')
    expect(originOf('https://user:pass@host/')).toBe('')
    expect(originOf('not a url')).toBe('')
  })

  it('keeps one entry per address and per computer, newest first', () => {
    write([])
    remember({ b: 'http://192.168.1.5:53279', l: '台式机', i: 'aaaabbbb' })
    remember({ b: 'https://abc.trycloudflare.com', l: '笔记本', i: 'ccccdddd' })
    // The tunnel address changes each time it is opened; the computer must not appear twice.
    remember({ b: 'https://xyz.trycloudflare.com', l: '笔记本', i: 'ccccdddd' })
    const list = hosts()
    expect(list.length).toBe(2)
    expect(list[0]?.b).toBe('https://xyz.trycloudflare.com')
    expect(list.map(host => host.l).sort()).toEqual(['台式机', '笔记本'])
    expect(list.length).toBeLessThanOrEqual(HOSTS_MAX)
  })

  it('carries the list in a link and merges it on the other computer without losing names', () => {
    write([])
    remember({ b: 'http://192.168.1.5:53279', l: '台式机', i: 'aaaabbbb' })
    const link = switchURL('https://abc.trycloudflare.com')
    expect(link).toContain('https://abc.trycloudflare.com/?rcfrom=')
    // The other computer has its own list; the link adds the computers it has not heard of.
    const incoming = payload()
    expect(merge(incoming).length).toBe(1)
    remember({ b: 'https://abc.trycloudflare.com', l: '笔记本', i: 'ccccdddd' })
    rename('https://abc.trycloudflare.com', '公司这台')
    expect(merge(incoming).map(host => host.l).sort()).toEqual(['台式机', '笔记本'])
    // The name this phone chose for a computer is its own; a link only teaches new names.
    expect(hosts().find(host => host.i === 'ccccdddd')?.a).toBe('公司这台')
  })

  it('ignores a link that is malformed or too long', () => {
    write([])
    expect(merge('not-base64-!!!')).toEqual([])
    expect(merge('A'.repeat(5000))).toEqual([])
    expect(merge('')).toEqual([])
  })

  it('builds a pairing link that keeps the list and the one-time code apart', () => {
    write([])
    remember({ b: 'http://192.168.1.5:53279', l: '台式机', i: 'aaaabbbb' })
    const link = pairURL('https://abc.trycloudflare.com', 'tok/en+1')
    expect(link.startsWith('https://abc.trycloudflare.com/pair?rcfrom=')).toBe(true)
    expect(link).toContain('#pair=tok%2Fen%2B1')
    expect(parseLink(link)).toEqual({ base: 'https://abc.trycloudflare.com', token: 'tok/en+1' })
  })

  it('reads a bare address, a full link, or a code seen by a camera', () => {
    expect(parseLink('192.168.1.5:53279')).toEqual({ base: 'http://192.168.1.5:53279' })
    expect(parseLink('abc.trycloudflare.com')).toEqual({ base: 'https://abc.trycloudflare.com' })
    expect(parseLink('https://abc.trycloudflare.com/?rcfrom=abc')).toEqual({ base: 'https://abc.trycloudflare.com' })
    expect(parseLink('https://abc.trycloudflare.com/pair#pair=abc')).toEqual({ base: 'https://abc.trycloudflare.com', token: 'abc' })
    expect(parseLink('')).toBeNull()
    expect(parseLink('ftp://abc.trycloudflare.com')).toBeNull()
  })
})

describe('the inline copies of the merge rule', () => {
  // The boot script and the pairing page run before any module loads, so they repeat the storage
  // rule. If one of them is changed alone, a phone moving between computers silently loses its list.
  const copies = [ADOPT_SCRIPT, pairingPage('orange'), pairingPage('black', '家里的电脑'), deniedPage('orange', '家里的电脑')]

  it('agree with the module on the storage key and the parameter name', () => {
    for (const copy of copies) {
      expect(copy).toContain('dsrc-hosts')
      expect(copy).toContain('rcfrom')
    }
    expect(ADOPT_SCRIPT).toContain(HOSTS_KEY)
  })

  it('reach the app page together with the rest of the boot script', () => {
    expect(injectBoot('<head></head>')).toContain(ADOPT_SCRIPT)
    expect(injectBoot('<head></head>')).toContain(BOOT_SCRIPT)
  })

  it('strip the parameter so the address stays shareable', () => {
    expect(ADOPT_SCRIPT).toContain('replaceState')
    expect(pairingPage()).toContain('replaceState')
  })
})

describe('the home-screen identity these pages install', () => {
  // The pairing page is usually the first page a phone sees, and it is what "add to home screen"
  // installs. Without these links the phone would install the Host's own manifest instead, which
  // names itself "DeepSeek Harness" and points at an SVG icon iOS cannot draw.
  it('names this plugin, not the Host, and points at its own icons', () => {
    for (const page of [pairingPage('orange'), pairingPage('black', '家里的电脑'), deniedPage('orange', '家里的电脑')]) {
      expect(page).toContain('/rc-app/manifest.webmanifest')
      expect(page).toContain('/rc-app/apple-touch-icon.png')
      expect(page).toContain('apple-mobile-web-app-title')
    }
  })
})
