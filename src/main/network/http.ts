import { request as requestHTTP } from 'node:http'
import { request as requestHTTPS } from 'node:https'
import type { HttpCheckResult, HttpRedirect } from '../../shared/network'
import { checkAbort, errorMessage, round, timestamp } from './native'
import { urlInput } from './validation'

function requestHeaders(url: string, signal: AbortSignal, method: 'HEAD' | 'GET'): Promise<{ status: number; text: string; location?: string }> {
  checkAbort(signal)
  return new Promise((resolve, reject) => {
    const request = (url.startsWith('https:') ? requestHTTPS : requestHTTP)(url, {
      method, signal, agent: false, headers: { 'User-Agent': 'ATLAS/0.3 Network Diagnostics', Accept: '*/*', ...(method === 'GET' ? { Range: 'bytes=0-0' } : {}) }
    }, response => {
      resolve({ status: response.statusCode ?? 0, text: response.statusMessage ?? '', location: response.headers.location })
      // Headers suffice. Never buffer a response body, including misbehaving HEAD servers.
      response.destroy()
    })
    request.on('error', reject)
    request.end()
  })
}
export function httpOutcome(status: number): string {
  if (status === 405 || status === 501) return 'Reachable; HEAD not supported'
  if (status >= 500) return 'Server-side failure'
  if (status === 403) return 'Reachable, but forbidden'
  if (status === 404) return 'Reachable, but resource missing'
  if (status >= 400) return 'Reachable; client request rejected'
  if (status >= 300) return 'Redirect response'
  return 'Available'
}
export async function httpCheck(input: string, signal?: AbortSignal, options: { fallbackGet?: boolean; timeoutMs?: number } = {}): Promise<HttpCheckResult> {
  const start = performance.now(), controller = new AbortController()
  let timedOut = false, url = input, finalUrl = input, statusCode: number | null = null, statusText = '', reachable = false, error: string | null = null, outcome = ''
  const redirects: HttpRedirect[] = []
  const cancel = () => controller.abort()
  signal?.addEventListener('abort', cancel, { once: true })
  const timeoutMs = options.timeoutMs ?? 10000
  let method: 'HEAD' | 'GET' = 'HEAD'
  const timer = setTimeout(() => { timedOut = true; cancel() }, timeoutMs)
  try {
    checkAbort(signal)
    url = urlInput(input); finalUrl = url
    for (let i = 0; i <= 5; i++) {
      statusCode = null; statusText = ''
      let response = await requestHeaders(finalUrl, controller.signal, method)
      if (options.fallbackGet && method === 'HEAD' && [403, 405, 501].includes(response.status)) {
        method = 'GET'
        response = await requestHeaders(finalUrl, controller.signal, method)
      }
      reachable = true; statusCode = response.status; statusText = response.text
      if ([301, 302, 303, 307, 308].includes(statusCode) && response.location) {
        if (i === 5) throw new Error('Redirect limit exceeded (5).')
        const next = urlInput(new URL(response.location, finalUrl).href)
        if (redirects.some(redirect => redirect.url === next)) throw new Error('Redirect loop detected.')
        redirects.push({ url: finalUrl, status: statusCode, location: next }); finalUrl = next
      } else { outcome = httpOutcome(statusCode); break }
    }
  } catch (failure) {
    const code = failure && typeof failure === 'object' && 'code' in failure ? String(failure.code) : ''
    outcome = signal?.aborted ? 'Cancelled' : timedOut ? 'Timeout' : ['ENOTFOUND', 'EAI_AGAIN'].includes(code) ? 'DNS failure' : code === 'ECONNREFUSED' ? 'Connection refused' : /CERT|TLS|SSL/.test(code) ? 'TLS certificate / handshake failure' : 'Connection failed'
    error = signal?.aborted ? 'Diagnostic cancelled.' : timedOut ? `No complete HTTP result within ${timeoutMs / 1000} seconds.` : errorMessage(failure)
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel) }
  return { kind: 'http', url, finalUrl, statusCode, statusText, method, duration: round(performance.now() - start), reachable, https: finalUrl.startsWith('https:'), outcome, redirects, success: !error && statusCode !== null && statusCode >= 200 && statusCode < 400, error, timestamp: timestamp(), cancelled: signal?.aborted ?? false }
}
