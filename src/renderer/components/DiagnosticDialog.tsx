import { useEffect, useRef, useState } from 'react'
import { Activity, Play, Square, X } from 'lucide-react'
import type { DiagnosticResult } from '../../shared/network'
import { DiagnosticResults } from './DiagnosticResults'
import { useModal } from './motion'
import { DiagnosticStages } from './DiagnosticStages'
import type { DiagnosticStage } from '../../shared/services'

export function DiagnosticDialog({ action, target, onClose }: { action: string; target?: string; onClose: () => void }) {
  const modal = useModal(onClose)
  const [stage, setStage] = useState<DiagnosticStage>('Local Network')
  const activeId = useRef<string | null>(null)
  const [input, setInput] = useState(target ?? (action === 'DNS Lookup' ? 'google.com' : action === 'HTTP Check' ? 'https://github.com' : '1.1.1.1'))
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<DiagnosticResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const full = action === 'Run Diagnostic'
  async function execute() {
    if (activeId.current) return
    const requestId = crypto.randomUUID(); activeId.current = requestId
    setRunning(true); setError(null); setResult(null); setStage('Local Network')
    try {
      const request = { requestId, target: input.trim() }
      const api = window.atlas.network
      const value = await (full ? api.diagnose(requestId) : action === 'DNS Lookup' ? api.dns(request) : action === 'HTTP Check' ? api.http(request) : action === 'Traceroute' ? api.traceroute(request) : api.ping({ ...request, count: 4 }))
      if (activeId.current === requestId) setResult(value)
    } catch (failure) { if (activeId.current === requestId) setError(String(failure).replace(/^.*?Error: /, '')) }
    finally { if (activeId.current === requestId) { activeId.current = null; setRunning(false) } }
  }
  useEffect(() => {
    const unsubscribe = window.atlas.network.onProgress(value => { if (value.requestId === activeId.current) setStage(value.stage) })
    const timer = full ? setTimeout(() => { void execute() }, 0) : undefined
    return () => {
      clearTimeout(timer)
      unsubscribe()
      const id = activeId.current; activeId.current = null
      if (id) void window.atlas.network.cancel(id).catch(() => {})
    }
    // One lifecycle per dialog; input changes must not restart a native job.
  }, [])
  return <dialog ref={modal.ref} className={`diagnostic-dialog live-diagnostic ${modal.closing ? 'closing' : ''}`} aria-labelledby="dialog-title" onCancel={event => { event.preventDefault(); modal.close() }} onClick={event => { if (event.target === event.currentTarget) modal.close() }}>
    <div className="dialog-content"><button className="dialog-close icon-button" aria-label="Close diagnostic" onClick={modal.close}><X size={18} /></button><div className="placeholder-icon"><Activity size={25} strokeWidth={1.4} /></div><div className="eyebrow">Native network diagnostic</div><h2 id="dialog-title">{action}</h2>
      {full ? <p>Gateway → local ping → 1.1.1.1 → 8.8.8.8 → DNS → HTTPS. Six ICMP probes per target; usually under a minute.</p> : <form className="diagnostic-form" onSubmit={event => { event.preventDefault(); void execute() }}><label htmlFor="diagnostic-target">{action === 'HTTP Check' ? 'URL or domain' : action === 'DNS Lookup' ? 'Domain' : 'Hostname or IP address'}</label><div><input autoFocus id="diagnostic-target" value={input} disabled={running} maxLength={action === 'HTTP Check' ? 2048 : 253} onChange={event => setInput(event.target.value)} spellCheck={false} required /><button className="primary-button" disabled={running || !input.trim()} type="submit"><Play size={13} />Run</button></div></form>}
      {running && <div className="diagnostic-progress" role="status"><span><span className="status-dot operational" />{action === 'Traceroute' ? 'Tracing up to 20 hops · 45 second limit' : full ? 'Measuring the connection…' : 'Measurement in progress…'}</span><button className="text-button" onClick={() => { if (activeId.current) void window.atlas.network.cancel(activeId.current) }}><Square size={11} />Cancel</button></div>}
      {running && full && <DiagnosticStages stage={stage} />}
      {error && <div className="diagnostic-error" role="alert">{error}</div>}
      {result && <DiagnosticResults result={result} />}
      {full && !running && <button className="primary-button" onClick={() => void execute()}><Play size={13} />Run again</button>}
      <div className="diagnostic-footnote">{action === 'Ping' ? 'Four ICMP probes · RTT in milliseconds · ICMP filtering can prevent replies.' : action === 'DNS Lookup' ? 'System-configured DNS servers · A and AAAA queries · no persistent results.' : action === 'HTTP Check' ? 'HEAD request · 10 second deadline · up to 5 redirects · no response body download.' : action === 'Traceroute' ? 'Windows tracert · no reverse DNS · timeout hops do not prove packet loss.' : 'Measured results only. A failed ICMP probe does not establish an outage.'}</div>
    </div>
  </dialog>
}
