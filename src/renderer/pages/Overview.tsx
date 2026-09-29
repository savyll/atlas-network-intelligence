import { MetricCards } from '../components/MetricCard'
import { LatencyChart } from '../components/LatencyChart'
import { ServiceStatus } from '../components/ServiceStatus'
import { ConnectionHealth, QuickActions, RecentEvents } from '../components/BottomPanels'
import type { PageName } from '../data/mockNetworkData'
import { useNetwork } from '../components/NetworkContext'

export function Overview({ onNavigate, onAction, onService }: { onService: (id: string) => void; onNavigate: (page: PageName) => void; onAction: (action: string) => void }) {
  const { snapshot, error } = useNetwork()
  return <div className="overview" aria-label="Overview"><MetricCards /><div className="main-grid"><LatencyChart /><ServiceStatus onOpen={onService} onViewAll={() => onNavigate('Services')} /></div><div className="bottom-grid"><ConnectionHealth /><RecentEvents onViewAll={() => onNavigate('History')} /><QuickActions onAction={onAction} /></div><div className="workspace-caption"><span>ATLAS / OVERVIEW</span><span>{error ?? snapshot?.error ?? (snapshot?.measuring ? 'Measuring connection' : snapshot?.updatedAt ? `Updated ${new Date(snapshot.updatedAt).toLocaleTimeString()}` : 'Starting measurements')} <i /> Live service checks</span></div></div>
}
