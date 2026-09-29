import { get } from 'node:https'
import type { ServiceDefinition, ServiceStatus, ServiceStatusProviderResult } from '../../../shared/services'
import { errorMessage, timestamp } from '../../network/native'

// Static official endpoints only. No renderer-controlled fetch URL or HTML scraping.
const sources = {
  github: { name: 'GitHub Status', url: 'https://www.githubstatus.com/api/v2/status.json' },
  discord: { name: 'Discord Status', url: 'https://discordstatus.com/api/v2/status.json' },
  cloudflare: { name: 'Cloudflare Status', url: 'https://www.cloudflarestatus.com/api/v2/status.json' }
}
const cache = new Map<string, ServiceStatusProviderResult>()
export function parseStatusPage(data: unknown): { status: ServiceStatus; description: string; updatedAt: string | null } {
  if (!data || typeof data !== 'object' || !('status' in data) || !data.status || typeof data.status !== 'object') throw new Error('Unrecognized official status response.')
  const value = data.status
  if (!('indicator' in value) || !('description' in value) || typeof value.description !== 'string') throw new Error('Missing official status fields.')
  const indicator = value.indicator
  if (!['none', 'minor', 'major', 'critical', 'maintenance'].includes(String(indicator))) throw new Error('Unknown official status indicator.')
  const page = 'page' in data ? data.page : null
  const updated = page && typeof page === 'object' && 'updated_at' in page && typeof page.updated_at === 'string' ? page.updated_at : null
  return { status: indicator === 'none' ? 'Operational' : indicator === 'major' || indicator === 'critical' ? 'Major Outage' : 'Degraded', description: value.description.slice(0, 500), updatedAt: updated && Number.isFinite(Date.parse(updated)) ? updated : null }
}
function fetchJSON(url: string, signal?: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Cancelled')); return }
    const request = get(url, { signal, agent: false, headers: { Accept: 'application/json', 'User-Agent': 'ATLAS/0.3' } }, response => {
      if (response.statusCode !== 200) { response.destroy(); reject(new Error(`Provider returned HTTP ${response.statusCode}.`)); return }
      let size = 0
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 65536) request.destroy(new Error('Official response exceeded 64 KB.')); else chunks.push(chunk) })
      response.on('error', reject)
      response.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch { reject(new Error('Invalid official JSON.')) } })
    })
    const timer = setTimeout(() => request.destroy(new Error('Official provider timed out.')), 6000)
    request.on('close', () => clearTimeout(timer)); request.on('error', reject)
  })
}
export async function officialStatus(provider: ServiceDefinition['provider'], signal?: AbortSignal): Promise<ServiceStatusProviderResult | null> {
  if (!provider) return null
  const previous = cache.get(provider)
  // Five-minute cache also applies to errors; manual checks cannot hammer a provider.
  if (previous && Date.now() - Date.parse(previous.fetchedAt) < 300000) return previous
  const source = sources[provider]
  let result: ServiceStatusProviderResult
  try { result = { provider: source.name, sourceUrl: source.url, fetchedAt: timestamp(), ...parseStatusPage(await fetchJSON(source.url, signal)), available: true, error: null } }
  catch (error) { result = { provider: source.name, sourceUrl: source.url, fetchedAt: timestamp(), updatedAt: null, status: 'Unknown', description: 'Official status unavailable; direct checks continue.', available: false, error: errorMessage(error) } }
  if (!signal?.aborted) cache.set(provider, result)
  return result
}
