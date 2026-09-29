import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { writeFile } from 'node:fs/promises'
import { ServiceMonitor } from '../src/main/services/serviceMonitor'
import { customService, defaultServices } from '../src/main/services/serviceRegistry'
import { checkService } from '../src/main/services/serviceChecker'
import { classify } from '../src/main/services/classification'
import { parseStatusPage } from '../src/main/services/statusProviders/genericStatusPage'
import { httpCheck } from '../src/main/network/http'
import type { DiagnosticSummary } from '../src/shared/network'
import type { ServiceCheckResult } from '../src/shared/services'

const now = () => new Date().toISOString()
function check(code = 200, duration = 100): ServiceCheckResult {
  return { timestamp: now(), assessment: code === 200 ? 'success' : 'failure', responseTime: duration, reason: '', official: null, cancelled: false,
    dns: { kind: 'dns', domain: 'test.invalid', ipv4: ['127.0.0.1'], ipv6: [], duration: 10, success: true, error: null, cancelled: false, timestamp: now(), ipv4Error: null, ipv6Error: null },
    http: { kind: 'http', url: 'https://test.invalid', finalUrl: 'https://test.invalid', statusCode: code, statusText: '', duration, reachable: true, https: true, outcome: '', redirects: [], timestamp: now(), success: code === 200, error: null, cancelled: false } }
}
function baseline(): { updatedAt: string; latest: DiagnosticSummary } {
  const ping = { kind: 'ping' as const, target: '1.1.1.1', resolvedAddress: '1.1.1.1', sent: 3, received: 3, lost: 0, packetLossPercent: 0, minimumLatency: 10, maximumLatency: 20, averageLatency: 15, jitter: 5, samples: [], timestamp: now(), success: true, error: null, cancelled: false }
  return { updatedAt: now(), latest: { kind: 'diagnostic', timestamp: now(), success: true, error: null, cancelled: false,
    gateway: { kind: 'gateway', address: '10.0.0.1', interfaceName: 'Fixture', interfaceIndex: 1, family: 4, hasLocalInterface: true, timestamp: now(), success: true, error: null, cancelled: false }, gatewayPing: ping, publicPings: [ping, ping], dns: check().dns, http: check().http,
    health: { score: 100, localNetwork: 'Good', internet: 'Good', dns: 'Good', summary: '', rules: [] } } }
}
test('Conservative state transitions, recovery, deduplicated events, bounded history and slow responses', () => {
  const monitor = new ServiceMonitor(() => {}, baseline)
  const step = (value = check()) => { monitor.accept('github', value); return monitor.get('github') }
  assert.equal(step().status, 'Unknown'); assert.equal(step().status, 'Operational')
  assert.equal(step(check(503)).status, 'Operational'); assert.equal(monitor.snapshot().events.length, 0)
  assert.equal(step(check(503)).status, 'Degraded'); assert.equal(monitor.snapshot().events.length, 1)
  assert.equal(step(check(503)).status, 'Degraded'); assert.equal(monitor.snapshot().events.length, 1)
  assert.equal(step(check(503)).status, 'Major Outage'); assert.equal(monitor.snapshot().events.length, 2)
  assert.equal(step(check(503)).status, 'Major Outage'); assert.equal(monitor.snapshot().events.length, 2)
  assert.equal(step().status, 'Major Outage'); assert.equal(step().status, 'Operational')
  assert.match(monitor.snapshot().events[0].message, /recovered/)
  assert.equal(step(check(200, 3000)).status, 'Operational'); assert.equal(step(check(200, 3000)).status, 'Degraded')
  assert.equal(step().status, 'Degraded'); assert.equal(step().status, 'Operational')
  for (let i = 0; i < 100; i++) step()
  assert.equal(monitor.get('github').history.length, 60)
  assert.equal(monitor.get('github').availability, 100)
  const before = monitor.get('github').history.length
  step({ ...check(), cancelled: true }); assert.equal(monitor.get('github').history.length, before)
  assert.equal(step({ ...check(403), assessment: 'inconclusive' }).status, 'Unknown')
  assert.equal(monitor.get('github').availability, 100)
})
test('Classifier respects missing evidence, shared network failures and official source scope/staleness', () => {
  let current = baseline()
  const monitor = new ServiceMonitor(() => {}, () => current)
  for (let i = 0; i < 4; i++) monitor.accept('github', check(503))
  assert.equal(monitor.get('github').classification.kind, 'LIKELY SERVICE-SIDE ISSUE')
  current = baseline(); current.latest.publicPings = current.latest.publicPings.map(value => ({ ...value, success: false })); current.latest.http.success = false
  assert.equal(classify(monitor.get('github'), current, 3).kind, 'LIKELY ISP / UPSTREAM ISSUE')
  current.latest.gateway.hasLocalInterface = false; current.latest.gatewayPing = null
  assert.equal(classify(monitor.get('github'), current, 3).kind, 'LIKELY LOCAL NETWORK ISSUE')
  current = baseline(); current.latest.dns.success = false
  assert.equal(classify(monitor.get('github'), current, 0).kind, 'LIKELY DNS ISSUE')
  assert.equal(classify(monitor.get('github'), { updatedAt: null, latest: null }, 0).kind, 'UNKNOWN')
  const official = { provider: 'Fixture', sourceUrl: 'https://example.com', fetchedAt: now(), updatedAt: now(), status: 'Major Outage' as const, description: 'Broad incident', available: true, error: null }
  const fresh = new ServiceMonitor(() => {}, baseline)
  fresh.accept('discord', { ...check(), official }); assert.equal(fresh.get('discord').status, 'Degraded')
  const old = new ServiceMonitor(() => {}, baseline)
  old.accept('discord', { ...check(), official: { ...official, updatedAt: '2020-01-01' } }); old.accept('discord', check())
  assert.equal(old.get('discord').status, 'Operational')
  old.accept('discord', { ...check(), official: { ...official, available: false, status: 'Unknown', error: 'Timeout' } })
  assert.equal(old.get('discord').status, 'Operational')
  assert.equal(parseStatusPage({ status: { indicator: 'minor', description: 'Partial disruption' }, page: { updated_at: now() } }).status, 'Degraded')
  assert.throws(() => parseStatusPage({ status: { indicator: 'surprise' } }))
})
test('Service scheduler is staggered, idempotent, bounded, coalesces manual checks and stops cleanly', async context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() })
  let calls = 0
  const monitor = new ServiceMonitor(() => {}, baseline, async () => { calls++; return check() })
  monitor.start(); monitor.start(); monitor.start()
  context.mock.timers.tick(4999); assert.equal(calls, 0)
  context.mock.timers.tick(1); for (let i = 0; i < 10; i++) await Promise.resolve()
  assert.equal(calls, 1)
  await Promise.all([monitor.check('youtube'), monitor.check('youtube')]); assert.equal(calls, 1)
  context.mock.timers.tick(3500); for (let i = 0; i < 10; i++) await Promise.resolve()
  assert.equal(calls, 2)
  monitor.stop(); context.mock.timers.tick(120000); await Promise.resolve(); assert.equal(calls, 2)
  monitor.start(); monitor.start(); context.mock.timers.tick(5000); for (let i = 0; i < 10; i++) await Promise.resolve()
  assert.equal(calls, 3); monitor.stop(); context.mock.timers.reset()
  const added = monitor.add({ name: 'Internal', url: 'http://127.0.0.1:45678' }); monitor.remove(added.definition.id)
  assert.throws(() => monitor.get(added.definition.id)); assert.throws(() => monitor.remove('github'))
  assert.throws(() => monitor.add({ name: 'Duplicate default', url: 'https://github.com/' }), /already monitored/)
  let finish: (value: ServiceCheckResult) => void = () => {}
  const shared = new ServiceMonitor(() => {}, baseline, () => new Promise(resolve => { finish = resolve }))
  const background = shared.check('github'), controller = new AbortController()
  const joined = shared.check('github', controller.signal); controller.abort()
  assert.equal((await joined).latest, null)
  finish(check()); await background; assert.ok(shared.get('github').latest); shared.stop()
})
test('Custom input and HEAD fallback, access restrictions, redirects and timeout', async () => {
  for (const url of ['file:///C:/Windows', 'javascript:alert(1)', 'http://user:pass@localhost', 'https://bad host']) assert.throws(() => customService({ name: 'Test', url }))
  assert.throws(() => customService({ name: 'x'.repeat(49), url: 'github.com' }))
  const methods: string[] = []
  const server = createServer((request, response) => {
    methods.push(request.method ?? '')
    if (request.url === '/timeout') return
    if (request.url === '/fallback' && request.method === 'HEAD') { response.writeHead(405); response.end(); return }
    if (request.url === '/loop') { response.writeHead(302, { Location: '/loop' }); response.end(); return }
    response.writeHead(Number(request.url?.slice(1)) || 200); response.flushHeaders(); response.end('Discarded test body')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const url = `http://127.0.0.1:${address.port}`
  try {
    const result = await checkService(customService({ name: 'Test', url: `${url}/fallback` }))
    assert.equal(result.assessment, 'success'); assert.equal(result.http.method, 'GET'); assert.deepEqual(methods, ['HEAD', 'GET'])
    for (const code of [401, 403, 429]) assert.equal((await checkService(customService({ name: 'Test', url: `${url}/${code}` }))).assessment, 'inconclusive')
    assert.equal((await checkService(customService({ name: 'Test', url: `${url}/503` }))).assessment, 'failure')
    assert.match((await httpCheck(`${url}/loop`)).error ?? '', /loop/)
    assert.equal((await httpCheck(`${url}/timeout`, undefined, { timeoutMs: 100 })).outcome, 'Timeout')
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
  assert.equal((await httpCheck(url)).outcome, 'Connection refused')
})
test('Real service endpoint matrix and official adapters', { timeout: 180000 }, async () => {
  const results: Record<string, ServiceCheckResult> = {}
  for (const definition of defaultServices) {
    const result = await checkService(definition); results[definition.id] = result
    assert.ok(result.timestamp); assert.equal(result.cancelled, false)
    assert.ok(['success', 'failure', 'inconclusive'].includes(result.assessment))
    console.log(`${definition.displayName}: DNS ${result.dns.success}, HTTP ${result.http.statusCode}, ${result.responseTime} ms, ${result.assessment}, official ${result.official?.status ?? 'none'}`)
  }
  const invalid = await checkService(customService({ name: 'Reserved invalid target', url: 'https://does-not-exist.atlas.invalid' }))
  results.invalid = invalid; assert.equal(invalid.assessment, 'failure'); assert.equal(invalid.dns.success, false)
  await writeFile('artifacts/services-validation.json', JSON.stringify(results, null, 2))
})
