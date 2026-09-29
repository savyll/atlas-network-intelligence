import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts()[0].pages()[0], errors = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()) })
await page.getByRole('dialog').waitFor({ state: 'detached' })
await page.getByRole('navigation').getByRole('button', { name: 'Services', exact: true }).click()
const github = await page.evaluate(() => window.atlas.services.get('github'))
const wait = github.latest ? 15100 - (Date.now() - Date.parse(github.latest.timestamp)) : 0
if (wait > 0) await page.waitForTimeout(wait)
const result = await page.evaluate(async () => {
  const frames = new Promise(resolve => {
    const times = []; let last = performance.now(), count = 0
    const tick = now => { times.push(now - last); last = now; if (++count < 180) requestAnimationFrame(tick); else resolve(times) }
    requestAnimationFrame(tick)
  })
  const [times, service] = await Promise.all([frames, window.atlas.services.check('github')])
  return { times, checkedAt: service.latest?.timestamp, samples: service.history.length, status: service.status }
})
assert.ok(result.checkedAt)
const sorted = [...result.times].sort((a, b) => a - b)
const frames = { median: sorted[90], p95: sorted[171], max: Math.max(...sorted), over50ms: sorted.filter(value => value > 50).length }
assert.ok(frames.median < 35)
await page.getByRole('button', { name: 'Open GitHub', exact: true }).click()
await page.locator('.service-evidence summary').first().click()
await page.screenshot({ path: 'artifacts/stage3-final-detail.png' })
await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'detached' })
await page.getByRole('navigation').getByRole('button', { name: 'Overview', exact: true }).click()
await page.mouse.move(5, 5)
await page.screenshot({ path: 'artifacts/stage3-final-overview.png' })
assert.deepEqual(errors, [])
await writeFile('artifacts/stage3-dev-validation.json', JSON.stringify({ errors, frames, service: result, status: 'passed' }, null, 2))
console.log(JSON.stringify({ errors, frames, status: 'passed' }))
await browser.close()
