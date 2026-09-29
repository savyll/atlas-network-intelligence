import { Resolver } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { DnsResult } from '../../shared/network'
import { checkAbort, errorMessage, round, timestamp } from './native'
import { hostInput } from './validation'

export async function dnsLookup(domain: string, signal?: AbortSignal): Promise<DnsResult> {
  const start = performance.now()
  const resolver = new Resolver({ timeout: 2200, tries: 1 })
  let ipv4: string[] = [], ipv6: string[] = [], ipv4Error: string | null = null, ipv6Error: string | null = null, error: string | null = null
  const cancel = () => resolver.cancel()
  const timer = setTimeout(cancel, 5000)
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    domain = hostInput(domain)
    if (isIP(domain)) throw new Error('DNS lookup requires a domain, not an IP address.')
    checkAbort(signal)
    const [a, aaaa] = await Promise.allSettled([resolver.resolve4(domain), resolver.resolve6(domain)])
    if (a.status === 'fulfilled') ipv4 = a.value; else ipv4Error = errorMessage(a.reason)
    if (aaaa.status === 'fulfilled') ipv6 = aaaa.value; else ipv6Error = errorMessage(aaaa.reason)
    if (!ipv4.length && !ipv6.length) error = signal?.aborted ? 'Diagnostic cancelled.' : `DNS resolution failed. ${ipv4Error ?? ipv6Error}`
  } catch (failure) { error = errorMessage(failure) }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel) }
  return { kind: 'dns', domain, ipv4, ipv6, ipv4Error, ipv6Error, duration: round(performance.now() - start), success: !signal?.aborted && (ipv4.length + ipv6.length > 0), error, timestamp: timestamp(), cancelled: signal?.aborted ?? false }
}
