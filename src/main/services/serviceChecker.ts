import { isIP } from 'node:net'
import type { ServiceCheckResult, ServiceDefinition } from '../../shared/services'
import { dnsLookup } from '../network/dns'
import { httpCheck } from '../network/http'
import { timestamp } from '../network/native'
import { officialStatus } from './statusProviders/genericStatusPage'

export async function checkService(definition: ServiceDefinition, signal?: AbortSignal, stage?: (stage: 'Service Endpoint' | 'Official Status') => void): Promise<ServiceCheckResult> {
  stage?.('Service Endpoint')
  const family = isIP(definition.domain)
  const dns = family ? { kind: 'dns' as const, domain: definition.domain, ipv4: family === 4 ? [definition.domain] : [], ipv6: family === 6 ? [definition.domain] : [], duration: 0, success: true, error: null, cancelled: false, timestamp: timestamp(), ipv4Error: null, ipv6Error: null } : await dnsLookup(definition.domain, signal)
  const http = await httpCheck(definition.checkUrl, signal, { fallbackGet: true, timeoutMs: definition.timeoutMs })
  stage?.('Official Status')
  const official = await officialStatus(definition.provider, signal)
  const code = http.statusCode
  // Access restrictions/rate limiting are not evidence of a company-wide outage.
  const inconclusive = code !== null && [401, 403, 429, 405, 501].includes(code)
  const assessment = signal?.aborted || inconclusive ? 'inconclusive' : http.success && dns.success ? 'success' : 'failure'
  return { timestamp: timestamp(), dns, http, official, cancelled: signal?.aborted ?? false,
    responseTime: http.reachable && !http.error ? http.duration : null, assessment,
    reason: signal?.aborted ? 'Check cancelled.' : inconclusive ? `HTTP ${code}: access or rate policy prevents a reliable availability measurement.` : !dns.success ? `Service DNS failed: ${dns.error}` : http.error ?? http.outcome }
}
