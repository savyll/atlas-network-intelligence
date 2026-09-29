import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Play, Search, Sun, X } from 'lucide-react'
import { useServices } from './ServicesContext'

export function Topbar({ onDiagnostic, onService }: { onDiagnostic: (action: string, target?: string) => void; onService: (id: string, diagnose?: boolean) => void }) {
  const { snapshot } = useServices()
  const [query, setQuery] = useState('')
  const [now, setNow] = useState(() => new Date())
  const [focused, setFocused] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 30000)
    const outside = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) setFocused(false) }
    const keyboard = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') { event.preventDefault(); input.current?.focus() }
      if (event.key === 'Escape') { setFocused(false); input.current?.blur() }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', keyboard)
    return () => { clearInterval(clock); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keyboard) }
  }, [])
  const normalized = query.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')
  const results = (snapshot?.services ?? []).filter(service => `${service.definition.displayName} ${service.definition.domain}`.toLowerCase().includes(normalized)).slice(0, 4)
  return <header className="topbar">
    <div className="search-wrap" ref={wrapper}>
      <div className={`search-field ${focused ? 'focused' : ''}`}><Search size={20} strokeWidth={1.5} />
        <input ref={input} aria-label="Search a host, domain, or IP address" placeholder="Search a host, domain, or IP address..." value={query} onFocus={() => setFocused(true)} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
          if (event.key === 'Enter' && query.trim()) { event.preventDefault(); setFocused(false); if (results.length === 1) onService(results[0].definition.id); else onDiagnostic(/^https?:\/\//i.test(query.trim()) ? 'HTTP Check' : 'Ping', query.trim()) }
        }} />
        {query ? <button className="icon-button" aria-label="Clear search" onClick={() => setQuery('')}><X size={14} /></button> : <kbd>Ctrl K</kbd>}
      </div>
      {focused && <div className="search-results"><div className="eyebrow">{query ? 'Monitored services' : 'Service shortcuts'}</div>
        {results.map(({ definition }) => <div className="search-service" key={definition.id}><button onClick={() => { setFocused(false); onService(definition.id) }}><div><strong>Open {definition.displayName}</strong><span>{definition.domain}</span></div><ArrowUpRight size={15} /></button><button className="search-diagnose" aria-label={`Diagnose ${definition.displayName} from search`} onClick={() => { setFocused(false); onService(definition.id, true) }}>Run diagnostic</button></div>)}
        {results.length === 0 && query.trim() && <button onClick={() => { setFocused(false); onDiagnostic(/^https?:\/\//i.test(query.trim()) ? 'HTTP Check' : 'Ping', query.trim()) }}><div><strong>Run host diagnostic</strong><span>{query.trim()}</span></div><ArrowUpRight size={15} /></button>}
      </div>}
    </div>
    <div className="topbar-right"><Sun className="day-icon" size={27} strokeWidth={1.2} /><div className="date-time"><span>{now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span><time>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>
      <button className="primary-button" onClick={() => onDiagnostic('Run Diagnostic')}><Play size={15} strokeWidth={1.8} />Run Diagnostic</button>
    </div>
  </header>
}
