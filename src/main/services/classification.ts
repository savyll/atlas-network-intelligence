import type { NetworkBaseline, OutageClassification, ServiceCheckResult, ServiceSnapshot, ServiceStatus } from '../../shared/services'

export function baselineHealth(baseline: NetworkBaseline) {
  const fresh = baseline.updatedAt && Date.now() - Date.parse(baseline.updatedAt) < 120000
  const result = fresh && baseline.latest && !baseline.latest.cancelled ? baseline.latest : null
  return { result, local: Boolean(result?.gatewayPing?.success), public: Boolean(result?.publicPings.some(ping => ping.success)), dns: Boolean(result?.dns.success) }
}
function officialIncident(check: ServiceCheckResult) {
  const official = check.official
  // Old incident metadata can be stale even when an endpoint itself responds today.
  return official?.available && Date.now() - Date.parse(official.fetchedAt) < 600000 && official.updatedAt && Date.now() - Date.parse(official.updatedAt) < 86400000 ? official.status : 'Unknown'
}
/** Two successes establish/recover health; one failure cannot create an outage.
 * Two failures or two >2s responses degrade. Four failures plus two HTTP 5xx
 * and healthy gateway/public-IP/DNS baselines confirm an endpoint outage.
 * A recent official major incident corroborates two direct failures.
 * Access restrictions are Unknown, excluded from availability and streaks.
 */
export function nextStatus(previous: ServiceSnapshot, check: ServiceCheckResult, failures: number, successes: number, baseline: NetworkBaseline): ServiceStatus {
  const official = officialIncident(check), health = baselineHealth(baseline)
  const serverFailure = (result: ServiceCheckResult | null) => (result?.http.statusCode ?? 0) >= 500 && result?.http.statusCode !== 501
  if (failures >= 2 && official === 'Major Outage') return 'Major Outage'
  if (failures >= 4 && health.local && health.public && health.dns && check.dns.success && serverFailure(check) && serverFailure(previous.latest)) return 'Major Outage'
  if (official === 'Major Outage' || official === 'Degraded') return 'Degraded'
  if (failures >= 2 || (check.responseTime !== null && check.responseTime > 2000 && (previous.latest?.responseTime ?? 0) > 2000)) return 'Degraded'
  if (successes >= 2) return 'Operational'
  if (check.assessment === 'inconclusive') return previous.status === 'Major Outage' || previous.status === 'Degraded' ? previous.status : 'Unknown'
  return previous.status
}
export function classify(service: ServiceSnapshot, baseline: NetworkBaseline, failingPeers: number): OutageClassification {
  const check = service.latest, health = baselineHealth(baseline)
  const answer = (kind: OutageClassification['kind'], explanation: string) => ({ kind, explanation })
  if (!check || check.cancelled) return answer('UNKNOWN', 'There are not enough completed measurements yet.')
  if (check.assessment === 'inconclusive') return answer('DEGRADED / AMBIGUOUS', `${check.reason} This does not establish a service outage.`)
  if (check.assessment === 'success' && service.status === 'Operational') return answer('SERVICE HEALTHY', 'Recent DNS and endpoint checks succeeded. This measures this endpoint from your connection, not every feature or region.')
  if (check.assessment === 'success' && service.status === 'Unknown') return answer('UNKNOWN', 'The latest endpoint check succeeded. Two consecutive checks with normal response times are needed to establish health.')
  if (!health.result) return answer('UNKNOWN', 'The endpoint has not established consistent health. A fresh connection diagnostic is needed to compare local, internet, and DNS evidence.')
  if (health.public && !health.dns) return answer('LIKELY DNS ISSUE', 'Public IP connectivity works, but the independent DNS test is failing.')
  if (!health.public && !health.result.http.success) {
    if (!health.result.gateway.hasLocalInterface) return answer('LIKELY LOCAL NETWORK ISSUE', 'No active local interface was found, and public connectivity checks failed.')
    if (health.local) return answer('LIKELY ISP / UPSTREAM ISSUE', `The gateway is reachable, but public connectivity checks failed.${failingPeers >= 2 ? ' Multiple unrelated service endpoints are also failing.' : ''} Upstream connectivity is a possibility, not a confirmed cause.`)
    return answer('DEGRADED / AMBIGUOUS', 'Gateway and public checks are not succeeding. Offline connectivity or ICMP filtering may explain this; the cause is not established.')
  }
  if (service.consecutiveFailures >= 2 && health.public && health.dns && (officialIncident(check) === 'Major Outage' || (check.http.statusCode ?? 0) >= 500)) return answer('LIKELY SERVICE-SIDE ISSUE', 'Independent internet and DNS checks succeed, while repeated target checks fail with server or official incident evidence. The affected scope may be limited to this endpoint.')
  if (officialIncident(check) === 'Degraded' || officialIncident(check) === 'Major Outage') return answer('DEGRADED / AMBIGUOUS', 'The official provider reports an incident across its service. Direct endpoint reachability may differ; the report does not establish that your specific feature is affected.')
  if (service.consecutiveFailures >= 2 && !check.dns.success && health.dns) return answer('DEGRADED / AMBIGUOUS', 'The independent DNS test succeeds, but this target cannot be resolved. Target DNS, filtering, or a configuration error may be responsible.')
  return answer('DEGRADED / AMBIGUOUS', check.assessment === 'success' ? 'The latest endpoint check succeeded; more consistent results are needed to confirm recovery or normal response times.' : 'An endpoint check failed. More evidence is needed before attributing this to the service, your network, or filtering.')
}
