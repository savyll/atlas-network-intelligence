import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChevronDown } from 'lucide-react'
import { type MetricName, type TimeRange } from '../data/mockNetworkData'
import { useNetwork } from './NetworkContext'
import { useLatestPoint } from './motion'

export function LatencyChart() {
  const { snapshot } = useNetwork()
  const history = useLatestPoint(snapshot?.history ?? [], ['cloudflare', 'google', 'packetLoss', 'jitter', 'dns'])
  const [metric, setMetric] = useState<MetricName>('Latency')
  const [range, setRange] = useState<TimeRange>('Last 6 hours')
  const data = useMemo(() => {
    const hours = range === 'Last hour' ? 1 : range === 'Last 3 hours' ? 3 : 6
    return history.filter(point => Date.parse(point.timestamp) >= Date.now() - hours * 3600000).map(point => ({ ...point, time: new Date(point.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) }))
  }, [history, range])
  const destinations = metric === 'Latency' ? [{ key: 'cloudflare', name: '1.1.1.1', color: '#e9be72' }, { key: 'google', name: '8.8.8.8', color: '#ae91d4' }] : [{ key: metric === 'Packet Loss' ? 'packetLoss' : metric === 'Jitter' ? 'jitter' : 'dns', name: metric === 'DNS Response' ? 'google.com DNS' : 'Public targets', color: '#e9be72' }]
  const unit = metric === 'Packet Loss' ? '%' : 'ms'
  return <section className="panel latency-panel" aria-labelledby="latency-title">
    <div className="panel-heading"><h2 id="latency-title">{metric} Over Time</h2><div className="chart-selectors">
      <label className="select-wrap"><span className="sr-only">Chart metric</span><select aria-label="Chart metric" value={metric} onChange={event => setMetric(event.target.value as MetricName)}>{['Latency', 'Packet Loss', 'Jitter', 'DNS Response'].map(option => <option key={option}>{option}</option>)}</select><ChevronDown size={12} /></label>
      <label className="select-wrap"><span className="sr-only">Time range</span><select aria-label="Time range" value={range} onChange={event => setRange(event.target.value as TimeRange)}>{['Last 6 hours', 'Last 3 hours', 'Last hour'].map(option => <option key={option}>{option}</option>)}</select><ChevronDown size={12} /></label>
    </div></div>
    <div className="chart-legend">{destinations.map(destination => <span key={destination.key}><i style={{ backgroundColor: destination.color }} />{destination.name}</span>)}</div>
    <div className="chart-container" data-testid="latency-chart"><span className="chart-unit">{unit}</span>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={50}>
        <LineChart data={data} margin={{ top: 14, right: 9, bottom: 4, left: -14 }} accessibilityLayer>
          <CartesianGrid stroke="rgba(180,190,197,0.07)" vertical={false} />
          <XAxis dataKey="time" tick={{ fill: '#a8afb7', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#434950' }} minTickGap={48} tickMargin={13} />
          <YAxis width={48} tick={{ fill: '#a8afb7', fontSize: 11 }} tickLine={false} axisLine={false} tickMargin={10} domain={[0, 'auto']} tickCount={4} />
          <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ stroke: '#9299a1', strokeDasharray: '5 5', strokeWidth: 1 }} isAnimationActive={false} />
          {destinations.map(destination => <Line key={destination.key} type="linear" dataKey={destination.key} name={destination.name} stroke={destination.color} strokeWidth={1.6} connectNulls={false} dot={data.length < 3 ? { r: 2 } : false} activeDot={{ r: 4, stroke: '#20262b', strokeWidth: 2 }} isAnimationActive={false} />)}
        </LineChart>
      </ResponsiveContainer>
      {(!data.length || data.every(point => metric === 'Latency' ? point.cloudflare === null && point.google === null : metric === 'Packet Loss' ? point.packetLoss === null : metric === 'Jitter' ? point.jitter === null : point.dns === null)) && <div className="chart-empty">{snapshot?.updatedAt ? 'No successful measurements for this metric' : 'Waiting for the first measurements'}</div>}
    </div>
    <div className="chart-footer"><span><span className={`status-dot ${snapshot?.updatedAt ? 'operational' : 'unknown'}`} />2 public targets</span><span>30 s between batches <span className="separator">·</span> Live measurements</span></div>
  </section>
}

function ChartTooltip({ active, payload, label, unit }: { active?: boolean; payload?: readonly { color?: string; name?: string | number; value?: string | number }[]; label?: string | number; unit: string }) {
  if (!active || !payload?.length) return null
  return <div className="chart-tooltip"><div className="tooltip-time">{label}</div>{payload.map(entry => <div key={entry.name}><span><i style={{ backgroundColor: entry.color }} />{entry.name}</span><strong>{entry.value} {unit}</strong></div>)}</div>
}
