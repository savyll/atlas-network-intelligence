import type { DiagnosticSummary, NetworkHealth, PingResult } from '../../shared/network'
import { round } from './native'

export const HEALTH_RULES = [
  'Latency: 25 points at ≤50 ms; 18 at ≤100; 10 at ≤200; otherwise 0.',
  'Packet loss across public probes: 30 points at 0%; 22 at ≤1%; 10 at ≤5%; otherwise 0.',
  'Mean per-target jitter: 15 points at ≤10 ms; 10 at ≤30; 5 at ≤60; otherwise 0.',
  'DNS A/AAAA query duration: 20 points at ≤100 ms; 14 at ≤250; 7 at ≤1000; otherwise 0 (including failure).',
  'HTTP: 10 points for a completed 2xx/3xx response; 5 for another HTTP response; 0 for failure.',
  'A score needs ≥2 successful RTTs on at least one public target, sent probes for both public targets, and completed DNS/HTTP tests. Otherwise Unknown. Gateway health is separate.'
]
export const unknownHealth = (): NetworkHealth => ({ score: null, localNetwork: 'Unknown', internet: 'Unknown', dns: 'Unknown', summary: 'Waiting for measurements.', rules: HEALTH_RULES })
export function publicMetrics(pings: PingResult[]) {
  const primary = pings.find(result => result.averageLatency !== null)
  const sent = pings.reduce((total, result) => total + result.sent, 0)
  const lost = pings.reduce((total, result) => total + result.lost, 0)
  const jitters = pings.flatMap(result => result.jitter === null ? [] : [result.jitter])
  return { latency: primary?.averageLatency ?? null, packetLoss: sent ? round(lost / sent * 100) : null, jitter: jitters.length ? round(jitters.reduce((a, b) => a + b, 0) / jitters.length) : null }
}
export function calculateHealth(result: Pick<DiagnosticSummary, 'gateway' | 'gatewayPing' | 'publicPings' | 'dns' | 'http'>): NetworkHealth {
  const health = unknownHealth(), metrics = publicMetrics(result.publicPings)
  const anyPublic = result.publicPings.some(ping => ping.success)
  const poor = (metrics.packetLoss ?? 0) > 1 || (metrics.latency ?? 0) > 150 || (metrics.jitter ?? 0) > 30
  health.localNetwork = !result.gateway.hasLocalInterface ? 'Unavailable' : result.gatewayPing?.success ? (result.gatewayPing.packetLossPercent! > 0 || result.gatewayPing.averageLatency! > 20 ? 'Degraded' : 'Good') : 'Unknown'
  health.internet = anyPublic ? (poor ? 'Degraded' : 'Good') : result.http.reachable ? 'Good' : 'Unknown'
  health.dns = result.dns.cancelled ? 'Unknown' : result.dns.success ? result.dns.duration > 250 ? 'Degraded' : 'Good' : 'Unavailable'
  if (result.dns.cancelled || result.http.cancelled || result.publicPings.some(ping => ping.cancelled)) health.summary = 'Diagnostic cancelled. Completed measurements are shown without a complete assessment.'
  else if (anyPublic && !result.dns.success) health.summary = 'Public IP replies were received, but DNS resolution failed. A DNS issue is likely.'
  else if (result.gatewayPing?.success && !anyPublic && !result.http.reachable) health.summary = 'Gateway replied; public ICMP and HTTP tests did not succeed. Possible upstream connectivity issue; filtering is also possible.'
  else if (result.gateway.hasLocalInterface && result.gatewayPing && !result.gatewayPing.success) health.summary = 'Local interface detected, but the gateway did not reply to ICMP. A local/gateway issue or ICMP filtering is possible.'
  else if (anyPublic && result.dns.success && result.http.success) {
    health.summary = !result.gatewayPing?.success ? 'Public IP, DNS and HTTPS tests succeeded; local gateway health is unconfirmed.'
      : result.publicPings.some(ping => !ping.success) ? 'DNS and HTTPS succeeded, but one public target could not be confirmed by ICMP.'
        : poor || health.localNetwork === 'Degraded' ? 'Connectivity succeeded with elevated loss, latency or jitter on at least one measured path.' : 'Basic connectivity tests succeeded.'
  }
  else if (result.http.reachable && !anyPublic) health.summary = 'HTTP is reachable, but public ICMP replies were not received. ICMP may be filtered.'
  else health.summary = 'Insufficient successful measurements to identify a cause.'
  const { latency, packetLoss, jitter } = metrics
  if (latency !== null && packetLoss !== null && jitter !== null && result.publicPings.length === 2 && result.publicPings.every(ping => ping.sent > 0 && !ping.cancelled) && !result.dns.cancelled && !result.http.cancelled) {
    health.score = (latency <= 50 ? 25 : latency <= 100 ? 18 : latency <= 200 ? 10 : 0)
      + (packetLoss === 0 ? 30 : packetLoss <= 1 ? 22 : packetLoss <= 5 ? 10 : 0)
      + (jitter <= 10 ? 15 : jitter <= 30 ? 10 : jitter <= 60 ? 5 : 0)
      + (!result.dns.success ? 0 : result.dns.duration <= 100 ? 20 : result.dns.duration <= 250 ? 14 : result.dns.duration <= 1000 ? 7 : 0)
      + (result.http.success ? 10 : result.http.statusCode !== null ? 5 : 0)
  }
  return health
}
