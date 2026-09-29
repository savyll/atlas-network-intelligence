import { isIP } from 'node:net'
import { domainToASCII } from 'node:url'
import type { DiagnosticRequest, PingRequest } from '../../shared/network'

export function hostInput(value: unknown): string {
  if (typeof value !== 'string' || value.length > 253) throw new Error('Enter a hostname or IP address (maximum 253 characters).')
  const host = value.trim().replace(/^\[([^\]]+)\]$/, '$1')
  if (/\s|[\u0000-\u001f\u007f]/.test(host)) throw new Error('Hostnames cannot contain whitespace or control characters.')
  if (isIP(host)) return host
  const ascii = domainToASCII(host.replace(/\.$/, ''))
  if (!ascii || ascii.length > 253 || !ascii.split('.').every(label => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label))) {
    throw new Error('Enter a valid hostname, domain, IPv4 or IPv6 address; omit URLs and command options.')
  }
  return ascii
}
export function urlInput(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\u0000-\u001f]/.test(value)) throw new Error('Enter a valid HTTP or HTTPS URL, without spaces.')
  const url = new URL(value.includes('://') ? value : `https://${value}`)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Only HTTP/HTTPS URLs without embedded credentials are supported.')
  hostInput(url.hostname)
  url.hash = ''
  return url.href
}
export function requestId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(value)) throw new Error('Invalid diagnostic request identifier.')
  return value
}
export function requestInput(value: unknown, http = false): DiagnosticRequest {
  if (!value || typeof value !== 'object' || !('requestId' in value) || !('target' in value)) throw new Error('Invalid diagnostic request.')
  return { requestId: requestId(value.requestId), target: http ? urlInput(value.target) : hostInput(value.target) }
}
export function pingInput(value: unknown): PingRequest {
  const request = requestInput(value)
  const count = (value as { count?: unknown }).count ?? 4
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 2 || count > 8) throw new Error('Ping count must be between 2 and 8.')
  return { ...request, count }
}
