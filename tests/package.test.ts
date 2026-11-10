import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const root = new URL('../', import.meta.url)

function bytes(path: string): Buffer {
  return readFileSync(new URL(path, root))
}

// The Host reads these manifests with a strict JSON parser, which rejects a byte
// order mark. PowerShell's ConvertFrom-Json and Node's own loaders both tolerate
// one, so an editor that adds it can break plugin loading while every local check
// still passes.
const manifests = ['package.json', 'assets/manifest.webmanifest']

for (const path of manifests) {
  it(`keeps ${path} free of a byte order mark`, () => {
    const raw = bytes(path)
    expect([...raw.subarray(0, 3)]).not.toEqual([0xef, 0xbb, 0xbf])
    expect([...raw.subarray(0, 2)]).not.toEqual([0xff, 0xfe])
  })

  it(`parses ${path} the way the Host does`, () => {
    expect(() => JSON.parse(bytes(path).toString('utf8'))).not.toThrow()
  })
}

it('points the home-screen manifest at icons the package actually ships', () => {
  const manifest = JSON.parse(bytes('assets/manifest.webmanifest').toString('utf8')) as {
    name: string
    short_name: string
    start_url: string
    icons: { src: string; sizes: string; type: string; purpose?: string }[]
  }
  expect(manifest.short_name).toBe('DSH 远程')
  expect(manifest.start_url).toBe('/')
  expect(manifest.icons.length).toBeGreaterThan(0)
  for (const icon of manifest.icons) {
    expect(icon.src.startsWith('/rc-app/')).toBe(true)
    expect(icon.type).toBe('image/png')
    const file = bytes(`assets/${icon.src.slice('/rc-app/'.length)}`)
    expect(file.subarray(1, 4).toString('latin1')).toBe('PNG')
    expect(file.length).toBeGreaterThan(0)
  }
  expect(manifest.icons.some(icon => icon.purpose === 'maskable')).toBe(true)
})

it('ships the assets folder with the published package', () => {
  const pkg = JSON.parse(bytes('package.json').toString('utf8')) as { files: string[] }
  expect(pkg.files).toContain('assets/*.png')
  expect(pkg.files).toContain('assets/*.webmanifest')
})
