import { useEffect, useRef, useState } from 'react'
import { Play, RefreshCw, Square, Trash2, X } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DiagnosticStage, ServiceDiagnostic } from '../../shared/services'
import { useServices } from './ServicesContext'
import { ServiceIcon, StatusLabel } from './ServiceIdentity'
import { AnimatedNumber, useLatestPoint, useModal } from './motion'
import { DiagnosticStages } from './DiagnosticStages'
import { DiagnosticResults } from './DiagnosticResults'
import { checkedTime } from '../pages/ServicesPage'

export function ServiceDetail({ id, diagnose = false, onClose }: { id: string; diagnose?: boolean; onClose: () => void }) {
  const { snapshot } = useServices(), modal = useModal(onClose), active = useRef<string | null>(null)
  const service = snapshot?.services.find(value => value.definition.id === id)
  const history = useLatestPoint(service?.history ?? [], ['responseTime'])
  const [result, setResult] = useState<ServiceDiagnostic | null>(null), [stage, setStage] = useState<DiagnosticStage>('Local Network')
  const [running, setRunning] = useState(false), [error, setError] = useState(''), [checking, setChecking] = useState(false)
  async function run() {
    if (active.current) return
    const requestId = crypto.randomUUID(); active.current = requestId; setRunning(true); setResult(null); setError(''); setStage('Local Network')
    try { const value = await window.atlas.services.diagnose({ id, requestId }); if (active.current === requestId) setResult(value) }
    catch (failure) { if (active.current === requestId) setError(String(failure).replace(/^.*?Error: /, '')) }
    finally { if (active.current === requestId) { active.current = null; setRunning(false) } }
  }
  useEffect(() => {
    const unsubscribe = window.atlas.services.onProgress(value => { if (value.requestId === active.current) setStage(value.stage) })
    const timer = diagnose ? setTimeout(() => void run(), 0) : undefined
    return () => { clearTimeout(timer); unsubscribe(); if (active.current) void window.atlas.services.cancel(active.current).catch(() => {}); active.current = null }
  }, [])
  if (!service) return null
  const check = service.latest, official = check?.official, conclusion = result?.cancelled ? null : result?.service.classification ?? service.classification
  return <dialog ref={modal.ref} className={`diagnostic-dialog service-detail live-diagnostic ${modal.closing ? 'closing' : ''}`} aria-labelledby="service-detail-title" onCancel={event => { event.preventDefault(); modal.close() }}><div className="dialog-content"><button className="dialog-close icon-button" aria-label="Close service" onClick={modal.close}><X size={18} /></button><div className="service-detail-heading"><ServiceIcon definition={service.definition} /><div><div className="eyebrow">Service monitor</div><h2 id="service-detail-title">{service.definition.displayName}</h2></div><StatusLabel status={service.status} /></div><p className="service-url">{service.definition.homepageUrl}</p>
    <div className="diagnostic-stats"><div><span>Response time</span><strong><AnimatedNumber value={check?.responseTime} decimals={0} /> ms</strong></div><div><span>Recent availability</span><strong>{service.availability ?? '—'}{service.availability === null ? '' : '%'}</strong></div><div><span>Last successful check</span><strong>{checkedTime(service.lastSuccessfulCheck)}</strong></div></div>
    <div className="service-measurements"><span>DNS <strong>{check ? check.dns.success ? `${check.dns.duration} ms` : 'Failed' : 'Pending'}</strong></span><span>HTTP <strong>{check?.http.statusCode ?? '—'} {check?.http.statusText}</strong></span><span>Checked <strong>{checkedTime(check?.timestamp)}</strong></span></div>
    <div className="service-detail-chart" aria-label="Recent real response times"><ResponsiveContainer width="100%" height="100%"><LineChart data={history.map(point => ({ ...point, time: checkedTime(point.timestamp) }))} margin={{ left: -20, right: 12, top: 12, bottom: 0 }}><CartesianGrid stroke="#b9c7d010" vertical={false} /><XAxis dataKey="time" minTickGap={65} tick={{ fill: '#8996a2', fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#8996a2', fontSize: 9 }} axisLine={false} tickLine={false} width={58} unit="ms" /><Tooltip contentStyle={{ background: '#192126', border: '1px solid #b6c2ca30', borderRadius: 5, fontSize: 11 }} formatter={value => [`${value} ms`, 'Response']} /><Line dataKey="responseTime" stroke="#d9bd88" strokeWidth={1.5} dot={service.history.length < 3 ? { r: 2 } : false} isAnimationActive={false} connectNulls={false} /></LineChart></ResponsiveContainer>{!service.history.length && <span className="chart-empty">Waiting for a completed check</span>}</div>
    <div className="atlas-conclusion"><div className="eyebrow">ATLAS / {conclusion?.kind ?? 'UNKNOWN'}</div><p>{conclusion?.explanation ?? 'The diagnostic was cancelled. No conclusion was drawn.'}</p></div>
    <details className="service-evidence"><summary>Endpoint & official evidence</summary><p>{check?.reason ?? 'Waiting for measurements.'}</p><p>Final URL: {check?.http.finalUrl ?? service.definition.checkUrl}<br />Method: {check?.http.method ?? 'HEAD'} · Redirects: {check?.http.redirects.length ?? 0}<br />Successful checks: {service.history.filter(point => point.available).length} / {service.history.filter(point => point.available !== null).length} assessed checks</p>{official ? <><p><strong>{official.provider}</strong> — {official.description}<br />Fetched {checkedTime(official.fetchedAt)} · Provider updated {official.updatedAt ? new Date(official.updatedAt).toLocaleString() : 'unknown'}</p><p className="service-url">{official.sourceUrl}</p>{official.error && <p>{official.error}</p>}<p>Official reports cover the provider’s broader service. Incident metadata older than 24 hours does not corroborate an outage here.</p></> : <p>No official JSON provider is configured for this service. Classification uses direct measurements.</p>}</details>
    <div className="service-actions"><button className="primary-button" disabled={running} onClick={() => void run()}><Play size={13} />Diagnose {service.definition.displayName}</button><button className="secondary-button" disabled={running || checking || service.checking} onClick={async () => { setChecking(true); setError(''); try { await window.atlas.services.check(id) } catch (failure) { setError(String(failure)) } finally { setChecking(false) } }}><RefreshCw size={13} />{checking || service.checking ? 'Checking…' : 'Check now'}</button>{service.definition.custom && <button className="text-button remove-service" disabled={running} onClick={async () => { try { await window.atlas.services.remove(id); onClose() } catch (failure) { setError(String(failure)) } }}><Trash2 size={13} />Remove</button>}</div>
    {running && <><DiagnosticStages stage={stage} service /><div className="diagnostic-progress" role="status"><span key={stage}>Checking {stage.toLowerCase()}…</span><button className="text-button" onClick={() => { if (active.current) void window.atlas.services.cancel(active.current) }}><Square size={11} />Cancel</button></div></>}{error && <div className="diagnostic-error" role="alert">{error}</div>}{result && <details className="service-evidence"><summary>{result.cancelled ? 'Cancelled diagnostic' : 'Connection diagnostic evidence'}</summary><DiagnosticResults result={result.network} /></details>}<div className="diagnostic-footnote">Up to 60 real samples · checks every ~60 seconds · manual checks reuse results younger than 15 seconds.</div></div></dialog>
}
