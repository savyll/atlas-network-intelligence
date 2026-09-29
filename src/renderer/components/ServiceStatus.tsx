import { ArrowRight } from 'lucide-react'
import { Sparkline } from './Sparkline'
import { useServices } from './ServicesContext'
import { ServiceIcon, StatusLabel } from './ServiceIdentity'
export function ServiceStatus({ onViewAll, onOpen }: { onViewAll: () => void; onOpen: (id: string) => void }) {
  const { snapshot, error } = useServices()
  return <section className="panel service-panel" aria-labelledby="services-title"><div className="panel-heading"><h2 id="services-title">Service Status</h2><button className="text-button" onClick={onViewAll}>View all<ArrowRight size={13} /></button></div>
    <div className="service-list">{snapshot?.services.filter(service => !service.definition.custom).map(service => <button className="service-row" key={service.definition.id} onClick={() => onOpen(service.definition.id)} aria-label={`Open ${service.definition.displayName}`} title={service.latest?.reason ?? 'Waiting for initial checks'}><ServiceIcon definition={service.definition} /><span className="service-name">{service.definition.displayName}</span><Sparkline values={service.history.slice(-30).map(point => point.responseTime)} color={`var(--${service.status === 'Operational' ? 'green' : service.status === 'Degraded' ? 'amber' : service.status === 'Major Outage' ? 'coral' : 'faint'})`} /><StatusLabel status={service.status} /></button>)}{error && <p className="quiet-empty">{error}</p>}</div>
  </section>
}
