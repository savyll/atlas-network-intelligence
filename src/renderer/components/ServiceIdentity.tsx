import { Cloud, Gamepad2, GitFork, Globe, Play, Square } from 'lucide-react'
import type { ServiceDefinition, ServiceStatus } from '../../shared/services'
const icons = { discord: Gamepad2, steam: Play, github: GitFork, cloudflare: Cloud, google: Globe, microsoft: Square, custom: Globe }
export const statusClass = (status: ServiceStatus) => status === 'Major Outage' ? 'outage' : status.toLowerCase()
export function ServiceIcon({ definition }: { definition: ServiceDefinition }) {
  const Icon = icons[definition.icon as keyof typeof icons] ?? Globe
  return <div className={`service-icon service-${definition.icon}`} style={{ color: definition.color }}>{definition.icon === 'youtube' ? <svg viewBox="0 0 24 24" width="23" height="23" aria-hidden="true"><rect x="1" y="4" width="22" height="16" rx="4" fill="currentColor" /><path d="m10 8 6 4-6 4Z" fill="#fff" /></svg> : definition.icon === 'spotify' ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8q8-4 16 1M5 12q7-3 14 1M6 16q6-2 12 1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> : <Icon size={22} strokeWidth={1.6} />}</div>
}
export function StatusLabel({ status }: { status: ServiceStatus }) {
  return <span className={`service-status ${statusClass(status)}`}><span className={`status-dot ${statusClass(status)}`} /><span key={status} className="status-label">{status}</span></span>
}
