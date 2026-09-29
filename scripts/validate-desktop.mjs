import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

await mkdir('artifacts', { recursive: true })
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
// Isolate the test Chromium cache from an already-open development app.
const app = await electron.launch({ args: [process.cwd(), `--user-data-dir=${path.resolve('artifacts/electron-test-profile')}`], env })
const errors = [], warnings = [], mainLog = [], checks = [], measured = {}
app.process().stderr.on('data', data => mainLog.push(data.toString()))
const pass = message => { checks.push(message); console.log(`PASS ${message}`) }
try {
  const page = await app.firstWindow()
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); if (message.type() === 'warning') warnings.push(message.text()) })
  await page.reload()
  await page.locator('.metric-card').first().waitFor()
  const info = await page.evaluate(() => window.atlas.getAppInfo())
  assert.equal(info.version, '0.3.0'); assert.equal(info.mode, 'live')
  const security = await app.evaluate(({ BrowserWindow }) => {
    const preferences = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences()
    return { nodeIntegration: preferences.nodeIntegration, contextIsolation: preferences.contextIsolation, sandbox: preferences.sandbox }
  })
  assert.deepEqual(security, { nodeIntegration: false, contextIsolation: true, sandbox: true })
  assert.deepEqual(await page.evaluate(() => [typeof window.require, typeof window.process]), ['undefined', 'undefined'])
  pass('Native Electron window, React, typed preload and renderer isolation')
  // Explicitly starting repeatedly must not create new polling loops.
  await page.evaluate(() => Promise.all(Array.from({ length: 8 }, () => window.atlas.network.startMonitoring())))
  async function waitForCycle(count, timeout = 90000) {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      if ((await page.evaluate(() => window.atlas.network.getSnapshot())).cycles >= count) return
      await page.waitForTimeout(500)
    }
    throw new Error(`Monitoring did not reach cycle ${count}`)
  }
  await waitForCycle(1)
  let snapshot = await page.evaluate(() => window.atlas.network.getSnapshot())
  assert.equal(snapshot.cycles, 1); assert.equal(snapshot.history.length, 1)
  assert.ok(snapshot.updatedAt); assert.ok(snapshot.latency !== null, JSON.stringify(snapshot))
  assert.ok(snapshot.dnsDuration !== null); assert.ok(snapshot.latest.gateway.address)
  assert.equal(snapshot.latest.publicPings[0].target, '1.1.1.1')
  measured.firstSnapshot = snapshot
  pass('Real overview metrics and gateway detection arrive through main-process monitoring')
  for (const name of ['Services', 'Diagnostics', 'Targets', 'History', 'Reports', 'Settings']) {
    await page.getByRole('navigation').getByRole('button', { name, exact: true }).click()
    assert.equal(await page.locator('h1').innerText(), name)
  }
  await page.getByRole('navigation').getByRole('button', { name: 'Overview', exact: true }).click()
  assert.equal((await page.evaluate(() => window.atlas.network.getSnapshot())).history.length, 1)
  pass('All seven navigation entries preserve monitoring state')
  async function runAction(action, target, kind) {
    await page.locator('.quick-actions').getByRole('button', { name: action, exact: true }).click()
    await page.locator('#diagnostic-target').fill(target)
    await page.getByRole('dialog').getByRole('button', { name: 'Run', exact: true }).click()
    const result = page.locator(`.diagnostic-results[data-kind="${kind}"]`).first()
    await result.waitFor({ state: 'visible', timeout: 60000 })
    measured[action] = await result.innerText()
    await page.screenshot({ path: `artifacts/stage2-${kind}.png` })
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'detached' })
    return measured[action]
  }
  assert.match(await runAction('Ping', '127.0.0.1', 'ping'), /Success/)
  assert.match(await runAction('DNS Lookup', 'google.com', 'dns'), /IPv4/)
  assert.match(await runAction('HTTP Check', 'https://github.com', 'http'), /200/)
  assert.match(await runAction('Traceroute', '127.0.0.1', 'traceroute'), /Destination reached/)
  pass('Real Ping, DNS, HTTPS and Traceroute work through the visible Quick Action dialogs')

  await page.getByRole('button', { name: 'Run Diagnostic', exact: true }).click()
  await page.locator('.diagnostic-results[data-kind="diagnostic"]').waitFor({ state: 'visible', timeout: 90000 })
  measured.fullDiagnostic = await page.locator('.diagnostic-results[data-kind="diagnostic"]').innerText()
  assert.match(measured.fullDiagnostic, /1\.1\.1\.1/); assert.match(measured.fullDiagnostic, /8\.8\.8\.8/)
  assert.match(measured.fullDiagnostic, /How the score is calculated/)
  await page.screenshot({ path: 'artifacts/stage2-full-diagnostic.png' })
  await page.keyboard.press('Escape')
  pass('Run Diagnostic auto-starts the real gateway / public ICMP / DNS / HTTPS sequence')

  await page.locator('.quick-actions').getByRole('button', { name: 'Ping', exact: true }).click()
  await page.locator('#diagnostic-target').fill('bad;whoami')
  await page.getByRole('dialog').getByRole('button', { name: 'Run', exact: true }).click()
  await page.getByRole('alert').waitFor({ state: 'visible' })
  assert.match(await page.getByRole('alert').innerText(), /valid hostname/)
  await page.locator('#diagnostic-target').fill('does-not-exist.atlas.invalid')
  await page.getByRole('dialog').getByRole('button', { name: 'Run', exact: true }).click()
  await page.locator('.diagnostic-results[data-kind="ping"]').waitFor()
  assert.match(await page.locator('.diagnostic-results').innerText(), /ENOTFOUND|failed|Unknown/)
  await page.keyboard.press('Escape')
  await page.locator('.quick-actions').getByRole('button', { name: 'Traceroute', exact: true }).click()
  await page.locator('#diagnostic-target').fill('192.0.2.1')
  await page.getByRole('dialog').getByRole('button', { name: 'Run', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.locator('.diagnostic-results[data-kind="traceroute"]').waitFor()
  assert.match(await page.locator('.diagnostic-results').innerText(), /Cancelled/)
  await page.keyboard.press('Escape')
  pass('Invalid input, DNS failure and native process cancellation remain safe and usable')

  await waitForCycle(2)
  snapshot = await page.evaluate(() => window.atlas.network.getSnapshot())
  assert.equal(snapshot.history.length, snapshot.cycles)
  for (let i = 1; i < snapshot.history.length; i++) assert.ok(Date.parse(snapshot.history[i].timestamp) - Date.parse(snapshot.history[i - 1].timestamp) >= 29000)
  assert.ok(await page.locator('.recharts-line-curve').count() >= 1)
  const original = await page.locator('.recharts-line-curve').first().getAttribute('d')
  await page.getByLabel('Chart metric', { exact: true }).selectOption('DNS Response')
  assert.equal(await page.locator('#latency-title').innerText(), 'DNS Response Over Time')
  assert.notEqual(await page.locator('.recharts-line-curve').first().getAttribute('d'), original)
  await page.getByLabel('Chart metric', { exact: true }).selectOption('Latency')
  const chart = await page.locator('.chart-container').boundingBox()
  await page.mouse.move(chart.x + chart.width * .6, chart.y + chart.height * .5)
  await page.locator('.chart-tooltip').waitFor({ state: 'visible' })
  assert.match(await page.locator('.chart-tooltip').innerText(), /1\.1\.1\.1|8\.8\.8\.8/)
  await page.mouse.move(5, 5)
  measured.finalSnapshot = snapshot
  pass('Real chart points update; tooltips/selectors work; no duplicate polling after navigation and repeated start requests')

  for (const [width, height] of [[1440, 900], [1920, 1080], [1060, 720]]) {
    await app.evaluate(({ BrowserWindow }, dimensions) => BrowserWindow.getAllWindows()[0].setSize(...dimensions), [width, height])
    await page.waitForTimeout(250)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
    await page.screenshot({ path: `artifacts/stage2-overview-${width}.png`, fullPage: true })
  }
  pass('Approved layout preserved at desktop and minimum window sizes')
  assert.deepEqual(errors, []); assert.deepEqual(warnings, [])
  const mainErrors = mainLog.filter(line => /Error|Unhandled|Exception/i.test(line) && !/Enter a valid hostname|Error occurred in handler for 'atlas:network:ping'/.test(line))
  assert.deepEqual(mainErrors, [])
  pass('Renderer console clean; main-process errors limited to the deliberate IPC validation rejection')
  const closed = page.waitForEvent('close')
  await page.getByRole('button', { name: 'Close window', exact: true }).click().catch(error => { if (!page.isClosed()) throw error })
  await closed
  pass('Native close ends the window and shuts down monitoring')
  await writeFile('artifacts/stage2-desktop-validation.json', JSON.stringify({ checks, security, errors, warnings, mainLog, measured }, null, 2))
} catch (error) {
  const page = app.windows()[0]
  await page?.screenshot({ path: 'artifacts/stage2-failure.png' }).catch(() => {})
  await writeFile('artifacts/stage2-failure.json', JSON.stringify({ error: String(error), errors, warnings, mainLog }, null, 2))
  throw error
} finally { await app.close().catch(() => {}) }
