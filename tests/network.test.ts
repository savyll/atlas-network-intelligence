import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { ping, parsePingSamples, pingStatistics } from '../src/main/network/ping'
import { parseTraceroute, traceroute } from '../src/main/network/traceroute'
import { hostInput, urlInput, pingInput } from '../src/main/network/validation'
import { dnsLookup } from '../src/main/network/dns'
import { httpCheck, httpOutcome } from '../src/main/network/http'
import { detectGateway } from '../src/main/network/gateway'
import { runDiagnostic } from '../src/main/network/diagnostics'
import { calculateHealth } from '../src/main/network/health'
import { NetworkMonitor, HISTORY_LIMIT } from '../src/main/network/monitor'
import type { DiagnosticSummary } from '../src/shared/network'

test('Monitoring is idempotent, sequential, bounded and stops/restarts without duplicate timers', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  let calls = 0
  const pingResult = { kind: 'ping' as const, target: '1.1.1.1', resolvedAddress: '1.1.1.1', samples: [], ...pingStatistics([{ sequence: 1, latency: 10, status: 'Success' }, { sequence: 2, latency: 20, status: 'Success' }]), timestamp: new Date().toISOString(), success: true, cancelled: false, error: null }
  const base: DiagnosticSummary = { kind: 'diagnostic', gateway: { kind: 'gateway', address: null, interfaceName: null, interfaceIndex: null, family: null, hasLocalInterface: true, success: false, timestamp: '', cancelled: false, error: null }, gatewayPing: null, publicPings: [pingResult, pingResult], dns: { kind: 'dns', domain: 'google.com', ipv4: ['1.1.1.1'], ipv6: [], duration: 15, ipv4Error: null, ipv6Error: null, timestamp: '', success: true, cancelled: false, error: null }, http: { kind: 'http', url: '', finalUrl: '', statusCode: 204, statusText: '', duration: 10, reachable: true, https: true, outcome: 'Available', redirects: [], timestamp: '', success: true, cancelled: false, error: null }, health: { score: 100, localNetwork: 'Unknown', internet: 'Good', dns: 'Good', summary: '', rules: [] }, success: true, cancelled: false, error: null, timestamp: new Date().toISOString() }
  const monitor = new NetworkMonitor(() => {}, () => false, async () => { calls++; return base })
  monitor.start(); monitor.start(); monitor.start()
  context.mock.timers.tick(2499); assert.equal(calls, 0)
  context.mock.timers.tick(1); await Promise.resolve(); await Promise.resolve(); assert.equal(calls, 1)
  for (let i = 0; i < 725; i++) { monitor.start(); context.mock.timers.tick(30000); await Promise.resolve(); await Promise.resolve() }
  assert.equal(calls, 726); assert.equal(monitor.snapshot().history.length, HISTORY_LIMIT)
  monitor.stop(); context.mock.timers.tick(90000); await Promise.resolve(); assert.equal(calls, 726)
  monitor.start(); context.mock.timers.tick(2500); await Promise.resolve(); await Promise.resolve(); assert.equal(calls, 727)
  monitor.stop()
  assert.equal(calculateHealth({ ...base, publicPings: base.publicPings.map(p => ({ ...p, ...pingStatistics([]), success: false })) }).score, null)
  assert.equal(calculateHealth({ ...base, publicPings: [pingResult, { ...pingResult, ...pingStatistics([]), success: false }] }).score, null)
  assert.match(calculateHealth({ ...base, dns: { ...base.dns, cancelled: true, success: false } }).summary, /cancelled/)
  context.mock.timers.reset()
})

test('ICMP JSON parsing, losses, true zero RTT, average and jitter', () => {
  const samples = parsePingSamples([{ status: 'Success', latency: 0 }, { status: 'TimedOut', latency: null }, { status: 'Success', latency: 10 }, { status: 'Success', latency: 30 }])
  const statistics = pingStatistics(samples)
  assert.equal(statistics.sent, 4); assert.equal(statistics.received, 3); assert.equal(statistics.packetLossPercent, 25)
  assert.equal(statistics.averageLatency, 13.33); assert.equal(statistics.jitter, 15)
  assert.equal(pingStatistics([]).packetLossPercent, null)
  assert.equal(pingStatistics([{ sequence: 1, latency: null, status: 'SendFailure' }]).packetLossPercent, null)
  assert.equal(pingStatistics(samples.slice(0, 1)).jitter, null)
  assert.equal(pingStatistics([{ sequence: 1, latency: null, status: 'TimedOut' }]).packetLossPercent, 100)
  assert.throws(() => parsePingSamples('bad'))
})
test('Traceroute parser handles bounds, loss, IPv6 and localized fallback', () => {
  const hops = parseTraceroute('  1    <1 ms   2 ms   3 ms  192.168.1.1\n  2    *    *    *    Request timed out.\n  3    10 ms  11 ms  12 ms  2001:4860:4860::8888\n  4    unsupported localized line')
  assert.equal(hops.length, 4); assert.equal(hops[0].belowOneMillisecond[0], true)
  assert.deepEqual(hops[0].latencies, [1, 2, 3]); assert.equal(hops[1].timeout, true)
  assert.equal(hops[2].address, '2001:4860:4860::8888'); assert.ok(hops[3].unparsed)
})
test('Input validation rejects commands, credentials, schemes and excessive counts', () => {
  for (const host of ['localhost', '127.0.0.1', '::1', '[::1]', 'google.com', 'xn--bcher-kva.de']) assert.ok(hostInput(host))
  for (const host of ['-n 999', 'google.com;calc', 'a & whoami', 'https://google.com', 'a\nlocalhost', '.bad', 'a'.repeat(64) + '.com']) assert.throws(() => hostInput(host))
  for (const url of ['file:///C:/Windows', 'http://user:pass@localhost', 'javascript:alert(1)', 'https://a b.com']) assert.throws(() => urlInput(url))
  assert.equal(urlInput('github.com'), 'https://github.com/')
  assert.throws(() => pingInput({ requestId: 'test', target: 'localhost', count: 1000 }))
  assert.match(httpOutcome(403), /forbidden/); assert.match(httpOutcome(404), /missing/); assert.match(httpOutcome(503), /Server/)
})
test('HTTP status, redirects, refusal, timeout and cancellation against local fixtures', async () => {
  const server = createServer((request, response) => {
    if (request.url === '/timeout') return
    if (request.url === '/redirect') { response.writeHead(301, { Location: '/200' }); response.end(); return }
    if (request.url === '/loop') { response.writeHead(302, { Location: '/loop' }); response.end(); return }
    response.writeHead(Number(request.url?.slice(1)) || 200); response.end()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const base = `http://127.0.0.1:${address.port}`
  try {
    for (const status of [200, 301, 403, 404, 405, 503]) {
      const result = await httpCheck(`${base}/${status}`)
      assert.equal(result.statusCode, status); assert.equal(result.reachable, true)
    }
    const redirect = await httpCheck(`${base}/redirect`)
    assert.equal(redirect.statusCode, 200); assert.equal(redirect.redirects[0].status, 301); assert.equal(redirect.finalUrl, `${base}/200`)
    assert.match((await httpCheck(`${base}/loop`)).error ?? '', /loop/)
    const controller = new AbortController(); const pending = httpCheck(`${base}/timeout`, controller.signal); setTimeout(() => controller.abort(), 50)
    assert.equal((await pending).cancelled, true)
    assert.equal((await httpCheck(`${base}/timeout`)).outcome, 'Timeout')
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
  assert.equal((await httpCheck(`${base}/200`)).outcome, 'Connection refused')
})
test('Real Windows diagnostics and required host matrix', { timeout: 180000 }, async () => {
  const results: Record<string, unknown> = {}
  for (const target of ['127.0.0.1', 'localhost', '::1', '1.1.1.1', '8.8.8.8', 'google.com', 'github.com', 'does-not-exist.atlas.invalid', '192.0.2.1']) {
    const result = await ping(target, 2); results[`ping:${target}`] = result
    if (target === '127.0.0.1' || target === 'localhost') { assert.equal(result.success, true, JSON.stringify(result)); assert.equal(result.sent, 2) }
    if (target.endsWith('.invalid')) { assert.equal(result.success, false); assert.equal(result.packetLossPercent, null) }
    console.log(`Ping ${target}: ${result.received}/${result.sent}, ${result.averageLatency ?? 'unknown'} ms, ${result.error ?? 'OK'}`)
  }
  for (const domain of ['google.com', 'github.com', 'does-not-exist.atlas.invalid']) {
    const result = await dnsLookup(domain); results[`dns:${domain}`] = result
    assert.equal(result.success, !domain.endsWith('.invalid'), JSON.stringify(result))
  }
  for (const url of ['https://google.com', 'https://github.com', 'http://does-not-exist.atlas.invalid']) {
    const result = await httpCheck(url); results[`http:${url}`] = result
    if (url.endsWith('.invalid')) assert.equal(result.outcome, 'DNS failure')
    console.log(`HTTP ${url}: ${result.statusCode} ${result.outcome}`)
  }
  results.gateway = await detectGateway()
  const trace = await traceroute('127.0.0.1'); results.traceroute = trace
  assert.equal(trace.reached, true, JSON.stringify(trace))
  const controller = new AbortController(); const pending = traceroute('192.0.2.1', controller.signal); setTimeout(() => controller.abort(), 1600)
  results.cancelledTrace = await pending; assert.equal((results.cancelledTrace as { cancelled: boolean }).cancelled, true)
  const full = await runDiagnostic(); results.full = full
  assert.equal(full.publicPings.length, 2)
  assert.ok(full.health.score === null || (full.health.score >= 0 && full.health.score <= 100))
  const noReplies = { ...full, publicPings: full.publicPings.map(result => ({ ...result, success: false, samples: [], ...pingStatistics([]) })) }
  assert.equal(calculateHealth(noReplies).score, null)
  await mkdir('artifacts', { recursive: true })
  await writeFile('artifacts/network-validation.json', JSON.stringify(results, null, 2))
})
