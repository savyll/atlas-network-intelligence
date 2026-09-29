import { Activity, ChartNoAxesColumnIncreasing, Crosshair, Database } from 'lucide-react'
import { metrics } from '../data/mockNetworkData'
import { Sparkline } from './Sparkline'
import { AnimatedNumber } from './motion'
import { useNetwork } from './NetworkContext'
const icons = [Crosshair, ChartNoAxesColumnIncreasing, Activity, Database]

export function MetricCards() {
  const { snapshot, error } = useNetwork()
  const values = [snapshot?.latency, snapshot?.packetLoss, snapshot?.jitter, snapshot?.dnsDuration]
  const keys = ['cloudflare', 'packetLoss', 'jitter', 'dns'] as const
  return <section className="metric-grid" aria-label="Network metrics">{metrics.map((metric, index) => {
    const Icon = icons[index]
    return <article key={metric.name} className="panel metric-card">
      <div className="metric-icon" style={{ color: metric.color, borderColor: `${metric.color}55` }}><Icon size={23} strokeWidth={1.5} /></div>
      <div className="metric-content"><h2>{metric.name}</h2><div className="metric-value"><AnimatedNumber value={values[index]} /><span>{metric.unit}</span></div><div className={`metric-trend ${values[index] == null ? 'unknown' : ''}`} title={error ?? snapshot?.error ?? snapshot?.health.summary}><span className="status-dot" />{values[index] == null ? snapshot?.updatedAt ? 'Unavailable' : 'Measuring' : 'Live measurement'}</div></div>
      <Sparkline values={(snapshot?.history ?? []).slice(-18).flatMap(point => point[keys[index]] === null ? [] : [point[keys[index]]!])} color={metric.color} />
    </article>
  })}</section>
}
