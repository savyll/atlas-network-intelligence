import { ArrowLeft } from 'lucide-react'
import { navigation } from '../components/Sidebar'
import type { PageName } from '../data/mockNetworkData'

const descriptions: Record<Exclude<PageName, 'Overview'>, { description: string; items: string[] }> = {
  Services: { description: 'Service availability and response times will appear here once monitoring is connected.', items: ['Service availability', 'Response times', 'Status history'] },
  Diagnostics: { description: 'Run a native network test. Results remain in this session; closing a running test cancels it.', items: ['Ping', 'Traceroute', 'DNS Lookup', 'HTTP Check'] },
  Targets: { description: 'Target management is planned for a later stage. Use Quick Actions to test an individual endpoint now.', items: ['Hosts & domains', 'Target groups', 'Monitoring intervals'] },
  History: { description: 'Persistent measurement history is planned for a later stage. Overview retains only this session’s bounded measurements.', items: ['Measurement timeline', 'Event filtering', 'Retention controls'] },
  Reports: { description: 'Summaries and exports will be available when real measurements are connected.', items: ['Performance summaries', 'Custom date ranges', 'Report exports'] },
  Settings: { description: 'Application preferences and configurable monitoring are planned for a later stage.', items: ['Monitoring preferences', 'Thresholds', 'Application settings'] }
}

export function PlaceholderPage({ page, onBack, onAction }: { page: Exclude<PageName, 'Overview'>; onBack: () => void; onAction: (action: string) => void }) {
  const Icon = navigation.find(item => item.name === page)!.icon
  const content = descriptions[page]
  return <div className="placeholder-page"><div className="page-heading"><div><div className="eyebrow">Workspace</div><h1>{page}</h1></div><span className="stage-badge">{page === 'Diagnostics' ? 'Native diagnostics' : 'Workspace preview'}</span></div><section className="panel placeholder-panel"><div className="placeholder-icon"><Icon size={30} strokeWidth={1.25} /></div><h2>{page}</h2><p>{content.description}</p><div className="planned-features">{content.items.map((item, index) => <div key={item}><span>0{index + 1}</span>{item}<small>{page === 'Diagnostics' ? <button className="text-button" onClick={() => onAction(item)}>Open →</button> : 'Planned'}</small></div>)}</div><button className="text-button" onClick={onBack}><ArrowLeft size={15} />Back to Overview</button></section></div>
}
