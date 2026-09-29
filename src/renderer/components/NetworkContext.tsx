import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { MonitorSnapshot } from '../../shared/network'

const Context = createContext<{ snapshot: MonitorSnapshot | null; error: string | null }>({ snapshot: null, error: null })
export function NetworkProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let mounted = true
    const unsubscribe = window.atlas.network.onSnapshot(value => { if (mounted) setSnapshot(value) })
    // startMonitoring is idempotent in main, including React StrictMode and HMR.
    window.atlas.network.startMonitoring().then(value => { if (mounted) setSnapshot(value) }).catch(failure => { if (mounted) setError(String(failure)) })
    return () => { mounted = false; unsubscribe() }
  }, [])
  return <Context.Provider value={{ snapshot, error }}>{children}</Context.Provider>
}
export function useNetwork() { return useContext(Context) }
