// Verifies the multi-host / multi-account switching feature against an isolated QA host.
// Usage: node scripts/multi-host-qa.mjs   (expects scripts/launch-qa.mjs already running)
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

const browserPath = process.env.DSH_QA_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const connection = JSON.parse(readFileSync('.qa/connection.json', 'utf8'))
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, passed: Boolean(ok), detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const manage = async (page, input = { action: 'status' }) => page.evaluate(async body => {
  const response = await fetch('/api/dsh-remote-control/manage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return response.json()
}, input)

const browser = await chromium.launch({ executablePath: browserPath, headless: true })
const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await desktop.newPage()
await page.goto(connection.url)
await page.waitForTimeout(1500)
const dismiss = page.getByRole('button', { name: '继续', exact: true })
if (await dismiss.count()) await dismiss.first().click()
await page.waitForTimeout(500)

// ---- 1. desktop panel shows this computer and can rename it
await page.getByRole('button', { name: '远程控制', exact: true }).first().click()
await page.waitForTimeout(800)
const hostSection = page.locator('section.dsrc-surface').filter({ has: page.getByRole('heading', { name: '这台电脑', exact: true }) })
await hostSection.waitFor({ timeout: 15000 })
check('desktop panel renders the 这台电脑 section', await hostSection.count() === 1)
const initialLabel = (await hostSection.locator('.dsrc-device-name').innerText()).trim()
check('desktop panel shows a computer label', initialLabel.length > 0, initialLabel)
await hostSection.locator('input[aria-label="这台电脑的名字"]').fill('QA 电脑甲')
await hostSection.getByRole('button', { name: '重命名', exact: true }).click()
await page.waitForTimeout(1200)
const renamed = (await hostSection.locator('.dsrc-device-name').innerText()).trim()
check('desktop panel rename persists', renamed === 'QA 电脑甲', renamed)

// ---- 2. start the remote connection (LAN mode keeps this QA run offline and deterministic)
const before = await manage(page)
if (!before.enabled) {
  await manage(page, { action: 'preferences', mode: 'lan', autoStart: false })
  await manage(page, { action: 'start' })
  await page.waitForTimeout(1500)
}
await page.waitForFunction(async () => {
  const r = await fetch('/api/dsh-remote-control/manage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'status' }) })
  const s = await r.json(); return s.enabled && s.phase === 'ready'
}, undefined, { timeout: 140000 })
let status = await manage(page)
if (status.activeMode !== 'lan') {
  await manage(page, { action: 'preferences', mode: 'lan', autoStart: false })
  await manage(page, { action: 'stop' })
  await page.waitForTimeout(1200)
  await manage(page, { action: 'start' })
  await page.waitForTimeout(1500)
  await page.waitForFunction(async () => {
    const r = await fetch('/api/dsh-remote-control/manage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'status' }) })
    const s = await r.json(); return s.enabled && s.phase === 'ready' && s.activeMode === 'lan'
  }, undefined, { timeout: 140000 })
  status = await manage(page)
}
check('gateway is ready', status.enabled && status.phase === 'ready', `${status.activeMode}/${status.gatewayPort}`)
check('status carries the host card', Boolean(status.host && status.host.id && status.host.label), JSON.stringify(status.host))
check('host label is the renamed one', status.host?.label === 'QA 电脑甲', status.host?.label)
// a fresh QR: tokens expire after five minutes
await manage(page, { action: 'refresh' })
const fresh = await manage(page)
const link = fresh.links?.[0]?.url ?? status.links?.[0]?.url
const phoneBase = link ? new URL(link).origin : ''
check('a pairing link exists', Boolean(link), link)

// ---- 3. pair a phone, then verify the switcher UI on the phone
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const mobile = await phone.newPage()
await mobile.goto(link)
await mobile.getByText('等待电脑确认，请查看本机远程控制面板').waitFor({ timeout: 30000 })
const request = (await manage(page)).requests[0]
check('desktop sees the pending pairing request', Boolean(request), request?.name)
await manage(page, { action: 'approve', id: request.id })
await mobile.getByRole('textbox', { name: '消息' }).waitFor({ timeout: 60000 })
check('phone reached the remote UI', true)

await mobile.getByRole('button', { name: '打开会话列表' }).click()
const chip = mobile.locator('.rc-host-chip')
await chip.waitFor({ timeout: 15000 })
check('sidebar brand shows the host chip', await chip.count() === 1, (await chip.innerText()).trim())
check('host chip carries the computer label', (await chip.innerText()).includes('QA 电脑甲'), (await chip.innerText()).trim())
await chip.click()
const sheet = mobile.locator('dialog.rc-picker-sheet[open]')
await sheet.waitFor()
const sheetText = await sheet.innerText()
check('switcher sheet lists the current computer', sheetText.includes('QA 电脑甲'))
check('switcher sheet marks the current computer', sheetText.includes('正在使用'))
check('switcher sheet offers 添加另一台电脑', sheetText.includes('添加另一台电脑'))
const hosts = await mobile.evaluate(() => JSON.parse(localStorage.getItem('dsrc-hosts') || '[]'))
check('phone remembered this computer', hosts.length === 1 && hosts[0].l === 'QA 电脑甲', JSON.stringify(hosts))
check('phone remembered the address', hosts[0]?.b === phoneBase, hosts[0]?.b)
await mobile.screenshot({ path: '.qa/multi-host-sheet.png' })

// ---- 4. a carrying link keeps the phone list and is stripped from the address
const second = await mobile.evaluate(base => {
  const list = JSON.parse(localStorage.getItem('dsrc-hosts') || '[]')
  const payload = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(list.map(({ i, l, b }) => ({ i, l, b })))))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${base}/?rcfrom=${payload}`
}, phoneBase)
await mobile.goto(second)
await mobile.waitForTimeout(1500)
const kept = await mobile.evaluate(() => JSON.parse(localStorage.getItem('dsrc-hosts') || '[]'))
check('carrying link keeps the phone host list', kept.length === 1 && kept[0].l === 'QA 电脑甲', JSON.stringify(kept))
check('carrying link is stripped from the address', !mobile.url().includes('rcfrom'), mobile.url())
await mobile.getByRole('textbox', { name: '消息' }).waitFor({ timeout: 30000 })
check('carrying link still lands on the remote UI', true)

// ---- 5. the pairing page merges a foreign computer list
const foreign = await mobile.evaluate(() => {
  const list = [{ i: 'e19fb631-daea-479e-a2d9-7ae64b0ee370', l: '另一台电脑', b: 'http://192.168.1.50:53279' }]
  const payload = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(list)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  localStorage.setItem('dsrc-hosts', JSON.stringify([]))
  return payload
})
await mobile.goto(`${phoneBase}/pair?rcfrom=${foreign}`)
await mobile.waitForTimeout(1200)
const merged = await mobile.evaluate(() => JSON.parse(localStorage.getItem('dsrc-hosts') || '[]'))
check('pairing page merges a foreign computer list', merged.some(h => h.b === 'http://192.168.1.50:53279'), JSON.stringify(merged))

// ---- 6. offline banner offers a switch action
await mobile.goto(`${phoneBase}/`)
await mobile.getByRole('textbox', { name: '消息' }).waitFor({ timeout: 30000 })
await mobile.evaluate(() => {
  const hosts = JSON.parse(localStorage.getItem('dsrc-hosts') || '[]')
  hosts.push({ i: 'other', l: '备用电脑', b: 'http://10.0.0.9:53279', t: Date.now() })
  localStorage.setItem('dsrc-hosts', JSON.stringify(hosts))
  window.dispatchEvent(new Event('dsh-rc-offline'))
})
await mobile.waitForTimeout(600)
const banner = mobile.locator('.rc-offline')
check('offline banner appears', await banner.count() === 1)
const bannerText = (await banner.innerText()).replace(/\s+/g, ' ').trim()
check('offline banner offers 切换到其他电脑', bannerText.includes('切换到其他电脑'), bannerText)
await mobile.screenshot({ path: '.qa/multi-host-offline.png' })

await browser.close()
const failed = results.filter(r => !r.passed)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) { for (const f of failed) console.log(`FAILED: ${f.name} ${f.detail}`); process.exitCode = 1 }
