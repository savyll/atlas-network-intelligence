import type { DiagnosticSummary, GatewayResult } from '../../shared/network'
import { ping } from './ping'
import { dnsLookup } from './dns'
import { httpCheck } from './http'
import { detectGateway } from './gateway'
import { calculateHealth } from './health'
import { timestamp } from './native'

export async function runDiagnostic(signal?: AbortSignal, count = 6, cachedGateway?: GatewayResult, progress?: (stage: import('../../shared/services').DiagnosticStage) => void): Promise<DiagnosticSummary> {
  progress?.('Local Network')
  const gateway = cachedGateway ?? await detectGateway(signal)
  const gatewayPing = gateway.address ? await ping(gateway.address, count, signal) : null
  // Sequential bounded probes: don't flood targets or create a process per packet.
  progress?.('Internet')
  const publicPings = [await ping('1.1.1.1', count, signal), await ping('8.8.8.8', count, signal)]
  progress?.('DNS')
  const dns = await dnsLookup('google.com', signal)
  const http = await httpCheck('https://www.gstatic.com/generate_204', signal)
  progress?.('ATLAS Conclusion')
  const health = calculateHealth({ gateway, gatewayPing, publicPings, dns, http })
  const cancelled = signal?.aborted ?? false
  return { kind: 'diagnostic', gateway, gatewayPing, publicPings, dns, http, health, cancelled, success: !cancelled && publicPings.some(result => result.success) && dns.success && http.success, timestamp: timestamp(), error: cancelled ? 'Diagnostic cancelled.' : null }
}
