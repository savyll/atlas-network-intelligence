import { Activity, Clock3, FileText, House, Layers3, Settings2, Target } from 'lucide-react'
import type { PageName } from '../data/mockNetworkData'
import { useNetwork } from './NetworkContext'

export const navigation = [
  { name: 'Overview', icon: House }, { name: 'Services', icon: Layers3 },
  { name: 'Diagnostics', icon: Activity }, { name: 'Targets', icon: Target },
  { name: 'History', icon: Clock3 }, { name: 'Reports', icon: FileText }, { name: 'Settings', icon: Settings2 }
] as const

export function AtlasMark() {
  return <svg className="atlas-mark" viewBox="0 0 58 52" fill="none" aria-hidden="true">
    <path d="M4 45 14 27 21 39M18 32 29 5 40 32M37 39 44 27 54 45" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" />
    <path d="m26 26 3-7 3 7" stroke="currentColor" strokeWidth="1.8" />
  </svg>
}

export function Sidebar({ page, onNavigate, version }: { page: PageName; onNavigate: (page: PageName) => void; version: string }) {
  const { snapshot } = useNetwork()
  const state = snapshot?.health.internet ?? 'Unknown'
  return <aside className="sidebar">
    <div className="brand"><AtlasMark /><div><div className="brand-name">ATLAS</div><div className="brand-subtitle">Network Intelligence</div></div></div>
    <nav aria-label="Main navigation">{navigation.map(({ name, icon: Icon }) =>
      <button key={name} className={`nav-item ${page === name ? 'active' : ''}`} aria-current={page === name ? 'page' : undefined} onClick={() => onNavigate(name)}><Icon size={20} strokeWidth={1.5} /><span>{name}</span></button>
    )}</nav>
    <div className="sidebar-bottom"><div className="system-status"><span className={`status-dot ${state === 'Good' ? 'operational' : state === 'Degraded' ? 'degraded' : 'unknown'}`} />{state === 'Good' ? 'Connectivity available' : state === 'Degraded' ? 'Connection degraded' : 'Connectivity unconfirmed'}</div><div className="version">v{version}<span>Live measurements</span></div></div>
  </aside>
}
