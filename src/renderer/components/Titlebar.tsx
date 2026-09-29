import { useEffect, useState } from 'react'
import { Copy, Minus, Square, X } from 'lucide-react'

export function Titlebar() {
  const [maximized, setMaximized] = useState(false)
  useEffect(() => window.atlas?.onMaximizedChange(setMaximized), [])
  return <div className="titlebar" aria-label="Window title bar">
    <div className="titlebar-drag" />
    <div className="window-controls">
      <button aria-label="Minimize window" onClick={() => void window.atlas.minimize()}><Minus size={15} /></button>
      <button aria-label={maximized ? 'Restore window' : 'Maximize window'} onClick={() => void window.atlas.toggleMaximize().then(setMaximized)}>{maximized ? <Copy size={12} /> : <Square size={12} />}</button>
      <button aria-label="Close window" className="window-close" onClick={() => void window.atlas.close()}><X size={16} /></button>
    </div>
  </div>
}
