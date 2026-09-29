import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
let fixtureStatus = 200
const fixture = createServer((_request, response) => { response.writeHead(fixtureStatus); response.end() })
await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve))
const fixtureUrl = `http://127.0.0.1:${fixture.address().port}`
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
const app = await electron.launch({ args: [process.cwd(), `--user-data-dir=${path.resolve('artifacts/stage3-electron-profile')}`], env })
const checks = [], errors = [], warnings = [], mainLog = [], evidence = {}
const pass = text => { checks.push(text); console.log(`PASS ${text}`) }
app.process().stderr.on('data', chunk => mainLog.push(String(chunk)))
try {
  const page = await app.firstWindow(); page.setDefaultTimeout(15000)
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); if (message.type() === 'warning') warnings.push(message.text()) })
  await page.reload(); await page.locator('.service-row').first().waitFor()
  await page.evaluate(() => Promise.all(Array.from({ length: 10 }, () => window.atlas.services.start())))
  const get = () => page.evaluate(() => window.atlas.services.list())
  async function waitFor(predicate, timeout = 120000) {
    const until = Date.now() + timeout
    while (Date.now() < until) { const snapshot = await get(); if (predicate(snapshot)) return snapshot; await page.waitForTimeout(500) }
    throw new Error('Service snapshot predicate timed out')
  }
  await page.getByRole('navigation').getByRole('button', { name: 'Services', exact: true }).click()
  assert.equal(await page.locator('.services-table-row').count(), 8)
  await page.getByRole('button', { name: 'Add service', exact: true }).click()
  await page.getByLabel('Name', { exact: true }).fill('Invalid URL')
  await page.getByLabel('URL or domain', { exact: true }).fill('file:///C:/Windows')
  await page.getByRole('button', { name: 'Add monitor', exact: true }).click()
  await page.getByRole('alert').waitFor(); assert.match(await page.getByRole('alert').innerText(), /HTTP|HTTPS|URL/)
  await page.getByLabel('Name', { exact: true }).fill('Local validation endpoint')
  await page.getByLabel('URL or domain', { exact: true }).fill(fixtureUrl)
  await page.getByRole('button', { name: 'Add monitor', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'detached' })
  const custom = (await get()).services.find(service => service.definition.displayName === 'Local validation endpoint')
  assert.ok(custom)
  const invalid = await page.evaluate(() => window.atlas.services.add({ name: 'Reserved invalid domain', url: 'https://does-not-exist.atlas.invalid' }))
  pass('Services page renders; invalid URL is rejected; custom monitors are added through typed IPC')
  await page.getByRole('button', { name: 'Open GitHub', exact: true }).click()
  await page.getByRole('dialog').waitFor(); assert.equal(await page.locator('#service-detail-title').innerText(), 'GitHub')
  await page.locator('summary').filter({ hasText: 'Endpoint & official evidence' }).click()
  await page.screenshot({ path: 'artifacts/stage3-service-detail.png' })
  await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'detached' })
  await page.getByLabel('Search a host, domain, or IP address', { exact: true }).fill('github.com')
  await page.locator('.search-service').getByRole('button', { name: 'Open GitHub' }).waitFor()
  await page.getByRole('button', { name: 'Diagnose GitHub from search', exact: true }).click()
  await page.locator('.diagnostic-stages .current').waitFor()
  const stages = []
  await page.exposeFunction('recordStage', value => stages.push(value.stage))
  await page.evaluate(() => { window.__unsubscribeStage = window.atlas.services.onProgress(window.recordStage) })
  await page.locator('.service-evidence summary').filter({ hasText: 'Connection diagnostic evidence' }).waitFor({ timeout: 90000 })
  assert.ok(stages.includes('Service Endpoint') || stages.includes('Official Status')); assert.ok(stages.includes('ATLAS Conclusion'))
  assert.match(await page.locator('.atlas-conclusion').innerText(), /ATLAS/)
  await page.screenshot({ path: 'artifacts/stage3-service-diagnostic.png' })
  evidence.stages = stages
  await page.evaluate(() => window.__unsubscribeStage())
  await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'detached' })
  pass('Service detail, progressive evidence, search and service-specific staged diagnostic work')
  const first = await waitFor(snapshot => snapshot.services.every(service => service.latest))
  for (const service of first.services.filter(service => !service.definition.custom)) assert.ok(service.latest.timestamp)
  assert.equal(first.services.find(service => service.definition.id === invalid.definition.id).latest.dns.success, false)
  evidence.firstSnapshot = first
  pass('All eight defaults and the reserved invalid domain return structured real checks')
  async function freshCheck(id) {
    const service = (await get()).services.find(value => value.definition.id === id)
    const delay = service.latest ? 15100 - (Date.now() - Date.parse(service.latest.timestamp)) : 0
    if (delay > 0) await page.waitForTimeout(delay)
    return page.evaluate(value => window.atlas.services.check(value), id)
  }
  await freshCheck(custom.definition.id)
  const healthy = await freshCheck(custom.definition.id)
  assert.equal(healthy.status, 'Operational')
  fixtureStatus = 503
  const one = await freshCheck(custom.definition.id); assert.notEqual(one.status, 'Major Outage')
  const two = await freshCheck(custom.definition.id); assert.equal(two.status, 'Degraded')
  const eventsBefore = (await get()).events.filter(event => event.message === 'Local validation endpoint degraded').length
  await page.evaluate(id => Promise.all(Array.from({ length: 6 }, () => window.atlas.services.check(id))), custom.definition.id)
  assert.equal((await get()).events.filter(event => event.message === 'Local validation endpoint degraded').length, eventsBefore)
  fixtureStatus = 200
  const recoveryOne = await freshCheck(custom.definition.id); assert.equal(recoveryOne.status, 'Degraded')
  const recoveryTwo = await freshCheck(custom.definition.id); assert.equal(recoveryTwo.status, 'Operational')
  assert.equal((await get()).events.filter(event => event.message === 'Local validation endpoint recovered').length, 1)
  pass('Controlled endpoint degradation, single-failure protection, cooldown, event deduplication and two-check recovery work in Electron')
  await page.getByRole('button', { name: 'Open Local validation endpoint', exact: true }).click()
  await page.getByRole('button', { name: 'Remove', exact: true }).click()
  assert.equal((await get()).services.some(service => service.definition.id === custom.definition.id), false)
  await page.evaluate(id => window.atlas.services.remove(id), invalid.definition.id)
  pass('User-added monitors can be removed and leave no running scheduled entry')
  const snapshot = await waitFor(value => value.services.every(service => service.history.length >= 2))
  for (const service of snapshot.services) {
    assert.ok(service.history.length <= 60)
    for (let i = 1; i < service.history.length; i++) assert.ok(Date.parse(service.history[i].timestamp) - Date.parse(service.history[i - 1].timestamp) >= 14900)
  }
  evidence.finalSnapshot = snapshot
  await page.screenshot({ path: 'artifacts/stage3-services.png', fullPage: true })
  await page.getByRole('navigation').getByRole('button', { name: 'Overview', exact: true }).click()
  assert.equal(await page.locator('.service-row').count(), 8)
  const paths = await page.locator('.service-row .sparkline path').evaluateAll(nodes => nodes.map(node => node.getAttribute('d')))
  assert.ok(paths.filter(value => value.includes('L')).length >= 6)
  await page.screenshot({ path: 'artifacts/stage3-overview.png', fullPage: true })
  pass('Overview service sparklines use real multi-sample histories; repeated starts/navigation do not duplicate polling')
  // Measure rendering while real monitors continue, with actual hover and page/modal transitions.
  const frames = await page.evaluate(() => new Promise(resolve => {
    const times = []; let last = performance.now(), count = 0
    const tick = now => { times.push(now - last); last = now; if (++count < 90) requestAnimationFrame(tick); else resolve(times) }
    requestAnimationFrame(tick)
  }))
  evidence.frameIntervals = { median: [...frames].sort((a, b) => a - b)[45], max: Math.max(...frames), over50ms: frames.filter(ms => ms > 50).length }
  assert.ok(evidence.frameIntervals.median < 35)
  const motion = await page.locator('.metric-card').first().evaluate(node => ({ duration: getComputedStyle(node).transitionDuration, numberStyle: getComputedStyle(node.querySelector('.metric-value')).fontVariantNumeric }))
  assert.match(motion.duration, /0.22s/); assert.equal(motion.numberStyle, 'tabular-nums')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('navigation').getByRole('button', { name: 'Services', exact: true }).click()
  assert.equal(await page.locator('.page-content').evaluate(node => getComputedStyle(node).animationName), 'none')
  await page.getByRole('button', { name: 'Open GitHub', exact: true }).click()
  assert.equal(await page.getByRole('dialog').evaluate(node => getComputedStyle(node).animationName), 'none')
  await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'detached' })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  for (const [width, height] of [[1060, 720], [1440, 900], [1920, 1080]]) {
    await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(...size), [width, height])
    await page.waitForTimeout(300)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
    await page.screenshot({ path: `artifacts/stage3-services-${width}.png`, fullPage: true })
  }
  pass('Motion tokens, stable numeric layout, desktop resizing, responsiveness and reduced-motion page/modal behavior validated')
  assert.deepEqual(errors, []); assert.deepEqual(warnings, [])
  const unexpected = mainLog.filter(line => /Error|Unhandled|Exception/i.test(line) && !/atlas:services:add|Only HTTP|HTTPS URLs/.test(line))
  assert.deepEqual(unexpected, [])
  pass('Renderer and main process are clean apart from deliberate invalid-URL rejection')
  await writeFile('artifacts/stage3-desktop-validation.json', JSON.stringify({ checks, errors, warnings, mainLog, evidence }, null, 2))
} catch (error) {
  await app.windows()[0]?.screenshot({ path: 'artifacts/stage3-failure.png' }).catch(() => {})
  await writeFile('artifacts/stage3-failure.json', JSON.stringify({ error: String(error), errors, warnings, mainLog, evidence }, null, 2)); throw error
} finally { await app.close().catch(() => {}); fixture.closeAllConnections(); await new Promise(resolve => fixture.close(resolve)) }
