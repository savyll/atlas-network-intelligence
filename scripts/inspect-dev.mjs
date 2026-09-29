import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages()[0]
if (process.argv.includes('--close')) {
  await page.evaluate(() => window.close()).catch(() => {})
  await browser.close().catch(() => {})
  process.exit(0)
}
const errors = []
const warnings = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => {
  if (message.type() === 'error') errors.push(message.text())
  if (message.type() === 'warning') warnings.push(message.text())
})
await page.reload()
await page.locator('.metric-card').first().waitFor()
await page.evaluate(() => document.fonts.ready)
const info = await page.evaluate(() => window.atlas.getAppInfo())
assert.equal(info.version, '0.3.0')
assert.equal(info.mode, 'live')
const deadline = Date.now() + 70000
while ((await page.evaluate(() => window.atlas.network.getSnapshot())).cycles < 1) {
  if (Date.now() > deadline) throw new Error('No live development snapshot')
  await page.waitForTimeout(500)
}
const ping = await page.evaluate(() => window.atlas.network.ping({ requestId: 'dev-loopback', target: '127.0.0.1', count: 2 }))
assert.equal(ping.received, 2)
// Inspect window handles while a known native diagnostic is actually running.
const trace = page.evaluate(() => window.atlas.network.traceroute({ requestId: 'dev-hidden-window', target: '192.0.2.1' }))
await page.waitForTimeout(600)
const nativeProcesses = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-Process tracert -ErrorAction SilentlyContinue | Select-Object Id,MainWindowHandle | ConvertTo-Json -Compress'], { windowsHide: true })
const handles = JSON.parse(nativeProcesses.stdout || '[]')
assert.ok([handles].flat().length > 0)
assert.ok([handles].flat().every(process => process.MainWindowHandle === 0), JSON.stringify(handles))
await page.evaluate(() => window.atlas.network.cancel('dev-hidden-window'))
assert.equal((await trace).cancelled, true)
await page.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click()
assert.equal(await page.locator('h1').innerText(), 'Settings')
await page.getByRole('navigation').getByRole('button', { name: 'Overview', exact: true }).click()
await page.getByRole('button', { name: 'Run Diagnostic', exact: true }).click()
await page.getByRole('dialog').waitFor({ state: 'visible' })
await page.locator('.diagnostic-results[data-kind="diagnostic"]').waitFor({ state: 'visible', timeout: 90000 })
await page.keyboard.press('Escape')
await page.screenshot({ path: 'artifacts/atlas-dev.png', fullPage: true })
assert.deepEqual(errors, [])
assert.deepEqual(warnings, [])
await writeFile('artifacts/dev-validation.json', JSON.stringify({ app: info, url: page.url(), errors, warnings, nativeWindowHandles: handles, ping, status: 'passed' }, null, 2))
console.log(JSON.stringify({ app: info, url: page.url(), errors, warnings, status: 'passed' }))
// Disconnect the inspector, leaving the user's desktop app running.
await browser.close()
