import { isIP } from 'node:net'
import type { TracerouteHop, TracerouteResult } from '../../shared/network'
import { errorMessage, resolveTarget, runCommand, timestamp, windowsBinary } from './native'
import { hostInput } from './validation'

export function parseTraceroute(output: string): TracerouteHop[] {
  return output.split(/\r?\n/).flatMap(line => {
    const start = line.match(/^\s*(\d{1,2})\s+(.+)$/)
    if (!start) return []
    const probes = [...start[2].matchAll(/(<\s*)?(\d+(?:[.,]\d+)?)\s*ms|\*/gi)]
    // Preserve '<1 ms' as an explicit upper bound, not an invented RTT.
    const latencies = probes.slice(0, 3).map(match => match[0] === '*' ? null : Number(match[2].replace(',', '.')))
    const belowOneMillisecond = probes.slice(0, 3).map(match => Boolean(match[1]))
    const address = start[2].split(/\s+/).map(token => token.replace(/[\[\]]/g, '')).find(token => isIP(token)) ?? null
    const hop: TracerouteHop = { hop: Number(start[1]), address, latencies, belowOneMillisecond, timeout: latencies.length === 3 && latencies.every(value => value === null) }
    if (latencies.length !== 3 || (!address && !hop.timeout)) hop.unparsed = start[2].slice(0, 240)
    return [hop]
  }).slice(0, 20)
}
export async function traceroute(target: string, signal?: AbortSignal): Promise<TracerouteResult> {
  let resolvedAddress: string | null = null, hops: TracerouteHop[] = [], error: string | null = null, timedOut = false, reached = false
  try {
    target = hostInput(target)
    if (process.platform !== 'win32') throw new Error('Traceroute currently requires Windows.')
    resolvedAddress = await resolveTarget(target, signal)
    const result = await runCommand(windowsBinary('tracert.exe'), ['-d', '-h', '20', '-w', '700', isIP(resolvedAddress) === 6 ? '-6' : '-4', resolvedAddress], '', 45000, signal)
    hops = parseTraceroute(result.stdout); timedOut = result.timedOut
    reached = hops.some(hop => hop.address === resolvedAddress && hop.latencies.some(value => value !== null))
    if (result.cancelled) error = 'Diagnostic cancelled; partial hops shown.'
    else if (timedOut) error = 'Traceroute exceeded 45 seconds; partial hops shown.'
    else if (!reached) error = hops.length ? 'Destination not confirmed within 20 hops. Routers may block or deprioritize ICMP.' : 'Windows returned no parseable hops.'
  } catch (failure) { error = errorMessage(failure) }
  return { kind: 'traceroute', target, resolvedAddress, hops, reached, timedOut, success: reached, error, timestamp: timestamp(), cancelled: signal?.aborted ?? false }
}
