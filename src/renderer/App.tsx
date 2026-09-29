import { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { Titlebar } from './components/Titlebar'
import { Topbar } from './components/Topbar'
import { DiagnosticDialog } from './components/DiagnosticDialog'
import { Overview } from './pages/Overview'
import { PlaceholderPage } from './pages/PlaceholderPage'
import type { PageName } from './data/mockNetworkData'
import { NetworkProvider } from './components/NetworkContext'
import { ServicesProvider } from './components/ServicesContext'
import { ServicesPage } from './pages/ServicesPage'
import { ServiceDetail } from './components/ServiceDetail'

export default function App() {
  return <NetworkProvider><ServicesProvider><AppShell /></ServicesProvider></NetworkProvider>
}
function AppShell() {
  const [page, setPage] = useState<PageName>('Overview')
  const [version, setVersion] = useState('0.3.0')
  const [service, setService] = useState<{ id: string; diagnose: boolean } | null>(null)
  const [diagnostic, setDiagnostic] = useState<{ action: string; target?: string } | null>(null)
  useEffect(() => {
    window.atlas?.getAppInfo().then(info => setVersion(info.version)).catch(error => console.error('Desktop bridge unavailable', error))
  }, [])
  const showDiagnostic = (action: string, target?: string) => setDiagnostic({ action, target })
  const openService = (id: string, diagnose = false) => setService({ id, diagnose })
  return <div className="app-shell"><div className="landscape" aria-hidden="true" /><Titlebar /><Sidebar page={page} onNavigate={setPage} version={version} /><main className="main-workspace"><Topbar onDiagnostic={showDiagnostic} onService={openService} /><div className="page-content" key={page}>{page === 'Overview' ? <Overview onNavigate={setPage} onAction={showDiagnostic} onService={openService} /> : page === 'Services' ? <ServicesPage onOpen={openService} /> : <PlaceholderPage page={page} onAction={showDiagnostic} onBack={() => setPage('Overview')} />}</div></main>{diagnostic && <DiagnosticDialog {...diagnostic} onClose={() => setDiagnostic(null)} />}{service && <ServiceDetail key={service.id} {...service} onClose={() => setService(null)} />}</div>
}
