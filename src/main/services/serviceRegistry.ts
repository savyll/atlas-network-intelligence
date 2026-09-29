import { randomUUID } from 'node:crypto'
import type { ServiceDefinition } from '../../shared/services'
import { urlInput } from '../network/validation'

const entries = [
  ['youtube', 'YouTube', 'https://www.youtube.com', '#e76870', null],
  ['discord', 'Discord', 'https://discord.com', '#aa94e8', 'discord'],
  ['spotify', 'Spotify', 'https://open.spotify.com', '#66cd88', null],
  ['steam', 'Steam', 'https://store.steampowered.com', '#bdc9d6', null],
  ['github', 'GitHub', 'https://github.com', '#e1e5e8', 'github'],
  ['cloudflare', 'Cloudflare', 'https://www.cloudflare.com', '#e7ad68', 'cloudflare'],
  ['google', 'Google', 'https://www.google.com', '#a9bcb0', null],
  ['microsoft', 'Microsoft', 'https://www.microsoft.com', '#d1bb91', null]
] as const
export const defaultServices: ServiceDefinition[] = entries.map(([id, displayName, homepageUrl, color, provider]) => ({
  id, displayName, homepageUrl, checkUrl: homepageUrl, domain: new URL(homepageUrl).hostname,
  icon: id, color, provider, intervalMs: 60000, timeoutMs: 8000, custom: false
}))
export function customService(input: unknown): ServiceDefinition {
  if (!input || typeof input !== 'object' || !('name' in input) || !('url' in input)) throw new Error('Provide a name and URL.')
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 48 || /[\x00-\x1f\x7f]/.test(input.name)) throw new Error('Use a service name between 1 and 48 characters.')
  const url = urlInput(input.url)
  return { id: `custom-${randomUUID()}`, displayName: input.name.trim(), homepageUrl: url, checkUrl: url,
    domain: new URL(url).hostname.replace(/^\[|\]$/g, ''), icon: 'custom', color: '#c9b58f', provider: null,
    intervalMs: 60000, timeoutMs: 8000, custom: true }
}
export function serviceId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9-]{1,64}$/.test(value)) throw new Error('Invalid service identifier.')
  return value
}
