import { ArrowRight, ChartNoAxesColumnIncreasing, ChevronRight, Database, Globe2, Route } from 'lucide-react'
import { useNetwork } from './NetworkContext'
import { useServices } from './ServicesContext'
import { AnimatedNumber } from './motion'

export function ConnectionHealth() {
  const { snapshot } = useNetwork()
  const { snapshot: services } = useServices()
  const states = services?.services.map(service => service.status) ?? []
  const serviceHealth = states.some(state => state === 'Major Outage') ? 'Unavailable' : states.some(state => state === 'Degraded') ? 'Degraded' : states.length && states.every(state => state === 'Operational') ? 'Good' : 'Unknown'
  const health = snapshot?.health
  const score = health?.score ?? null
  return <section className="panel health-panel" aria-labelledby="health-title"><div className="panel-heading"><h2 id="health-title">Connection Health</h2></div><div className="health-content">
    <div className="health-gauge" role="img" aria-label={`Connection health: ${score ?? 'Unknown'}`} title={health ? [health.summary, ...health.rules].join('\n') : 'Waiting for measurements'}><svg viewBox="0 0 120 120" aria-hidden="true"><circle className="gauge-track" cx="60" cy="60" r="51" /><circle className="gauge-value" cx="60" cy="60" r="51" pathLength="100" strokeDasharray={`${score ?? 0} 100`} /></svg><div><strong><AnimatedNumber value={score} decimals={0} /></strong><span>{score === null ? 'Unknown' : '/ 100'}</span></div></div>
    <div className="health-checks">{[['Local Network', health?.localNetwork ?? 'Unknown'], ['Internet', health?.internet ?? 'Unknown'], ['DNS', health?.dns ?? 'Unknown'], ['Monitored Services', serviceHealth]].map(([label, state]) => <div key={label}><span>{label}</span><span><i className={`status-dot ${state === 'Good' ? 'operational' : state === 'Degraded' ? 'degraded' : state === 'Unavailable' ? 'outage' : 'unknown'}`} />{state}</span></div>)}</div>
  </div></section>
}

export function RecentEvents({ onViewAll }: { onViewAll: () => void }) {
  const { snapshot } = useNetwork()
  const { snapshot: services } = useServices()
  const events = [...(snapshot?.events ?? []), ...(services?.events ?? [])].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).slice(0, 5)
  return <section className="panel events-panel" aria-labelledby="events-title"><div className="panel-heading"><h2 id="events-title">Recent Events</h2><button className="text-button" onClick={onViewAll}>View all<ArrowRight size={13} /></button></div><div className="event-list">{events.map(event => <div className="event-row" key={`${event.timestamp}-${event.message}`}><span className={`status-dot ${event.status}`} aria-label={event.status} /><time>{new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><span className="event-message" title={event.message}>{event.message}</span><span className="event-detail">{event.detail}</span></div>)}{!events.length && <p className="quiet-empty">Connection events will appear after measurement.</p>}</div></section>
}

export function QuickActions({ onAction }: { onAction: (action: string) => void }) {
  return <section className="panel actions-panel" aria-labelledby="actions-title"><div className="panel-heading"><h2 id="actions-title">Quick Actions</h2></div><div className="quick-actions">{[
    { name: 'Ping', icon: ChartNoAxesColumnIncreasing }, { name: 'Traceroute', icon: Route },
    { name: 'DNS Lookup', icon: Database }, { name: 'HTTP Check', icon: Globe2 }
  ].map(({ name, icon: Icon }) => <button key={name} onClick={() => onAction(name)}><Icon size={23} strokeWidth={1.4} /><span>{name}</span><ChevronRight size={15} strokeWidth={1.3} /></button>)}</div></section>
}
