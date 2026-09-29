import type { PingResult, PingSample } from '../../shared/network'
import { checkAbort, errorMessage, powershell, resolveTarget, round, timestamp } from './native'
import { hostInput } from './validation'

// No localized ping.exe text: serialize the Windows .NET ICMP reply properties.
const PING_SCRIPT = `
$p = [Console]::ReadLine() | ConvertFrom-Json
$ping = New-Object System.Net.NetworkInformation.Ping
$samples = @()
try {
  for ($i=1; $i -le $p.count; $i++) {
    try {
      $reply = $ping.Send([System.Net.IPAddress]::Parse($p.address), 1200)
      $latency = $null
      if ($reply.Status -eq 'Success') { $latency = $reply.RoundtripTime }
      $samples += @{sequence=$i; latency=$latency; status=$reply.Status.ToString()}
    } catch { $samples += @{sequence=$i; latency=$null; status='SendFailure'} }
    if ($i -lt $p.count) { Start-Sleep -Milliseconds 350 }
  }
} finally { $ping.Dispose() }
ConvertTo-Json -InputObject @($samples) -Compress
`
export function parsePingSamples(raw: unknown): PingSample[] {
  if (!Array.isArray(raw) || raw.length > 8) throw new Error('Invalid Windows ping response.')
  return raw.map((sample: unknown, index) => {
    if (!sample || typeof sample !== 'object' || !('status' in sample) || typeof sample.status !== 'string' || !('latency' in sample)) throw new Error('Invalid ICMP sample.')
    const latency = sample.status === 'Success' && typeof sample.latency === 'number' && Number.isFinite(sample.latency) && sample.latency >= 0 ? sample.latency : null
    return { sequence: index + 1, status: sample.status, latency }
  })
}
export function pingStatistics(samples: PingSample[]) {
  const successful = samples.flatMap(sample => sample.latency === null ? [] : [sample.latency])
  // An API exception is not evidence that a packet was sent or lost on the wire.
  const sent = samples.filter(sample => sample.status !== 'SendFailure').length, received = successful.length
  // Mean absolute difference of consecutive successful RTTs in this one target's batch.
  // Missing replies are excluded, never substituted with zero; <2 replies => unknown.
  const differences = successful.slice(1).map((value, index) => Math.abs(value - successful[index]))
  return {
    sent, received, lost: sent - received, packetLossPercent: sent ? round((sent - received) / sent * 100) : null,
    minimumLatency: received ? Math.min(...successful) : null, maximumLatency: received ? Math.max(...successful) : null,
    averageLatency: received ? round(successful.reduce((a, b) => a + b, 0) / received) : null,
    jitter: differences.length ? round(differences.reduce((a, b) => a + b, 0) / differences.length) : null
  }
}
export async function ping(target: string, count = 4, signal?: AbortSignal): Promise<PingResult> {
  let resolvedAddress: string | null = null
  let samples: PingSample[] = []
  let error: string | null = null
  try {
    target = hostInput(target)
    if (!Number.isInteger(count) || count < 2 || count > 8) throw new Error('Invalid sample count.')
    resolvedAddress = await resolveTarget(target, signal)
    checkAbort(signal)
    samples = parsePingSamples(await powershell(PING_SCRIPT, { address: resolvedAddress, count }, count * 1600 + 8000, signal))
    if (samples.every(sample => sample.status === 'SendFailure')) error = 'Windows could not send the ICMP probes. Check local connectivity or OS policy; packet loss is unknown.'
    else if (!samples.some(sample => sample.latency !== null)) error = 'No ICMP replies. The host may be unreachable or may block ICMP; this alone does not establish an outage.'
  } catch (failure) { error = errorMessage(failure) }
  return { kind: 'ping', target, resolvedAddress, samples, ...pingStatistics(samples), timestamp: timestamp(), success: samples.some(sample => sample.latency !== null), error, cancelled: signal?.aborted ?? false }
}
