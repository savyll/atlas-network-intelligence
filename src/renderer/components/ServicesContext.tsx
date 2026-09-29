import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { ServicesSnapshot } from '../../shared/services'
const Context = createContext<{ snapshot: ServicesSnapshot | null; error: string | null }>({ snapshot: null, error: null })
export function ServicesProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<ServicesSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let mounted = true
    if (!window.atlas?.services) { setError('Service monitoring requires the desktop app.'); return }
    const unsubscribe = window.atlas.services.onSnapshot(value => { if (mounted) setSnapshot(value) })
    void window.atlas.services.start().then(value => { if (mounted) setSnapshot(value) }).catch(failure => { if (mounted) setError(String(failure)) })
    return () => { mounted = false; unsubscribe() }
  }, [])
  return <Context.Provider value={{ snapshot, error }}>{children}</Context.Provider>
}
export const useServices = () => useContext(Context)
