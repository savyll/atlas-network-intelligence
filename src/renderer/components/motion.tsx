import { useEffect, useLayoutEffect, useRef, useState } from 'react'
export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)'), update = () => setReduced(media.matches)
    media.addEventListener('change', update); return () => media.removeEventListener('change', update)
  }, [])
  return reduced
}
/** Short interpolation only when measurements change; no idle animation loop. */
export function AnimatedNumber({ value, decimals = 1 }: { value: number | null | undefined; decimals?: number }) {
  const reduced = useReducedMotion(), previous = useRef(value), [display, setDisplay] = useState(value)
  useEffect(() => {
    const from = previous.current; previous.current = value
    if (reduced || from == null || value == null || from === value) { setDisplay(value); return }
    let frame = 0; const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 160)
      setDisplay(from + (value - from) * (1 - (1 - progress) ** 3))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame)
  }, [value, reduced])
  return <>{display == null ? '—' : Number(display.toFixed(decimals))}</>
}
export function useModal(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [closing, setClosing] = useState(false), reduced = useReducedMotion()
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null, element = ref.current
    element?.showModal()
    return () => { clearTimeout(timer.current); element?.close(); if (previous?.isConnected) previous.focus() }
  }, [])
  const close = () => { if (!closing) { setClosing(true); timer.current = setTimeout(onClose, reduced ? 0 : 160) } }
  return { ref, close, closing }
}

/** Only the newest point interpolates; older history never replays its entrance. */
export function useLatestPoint<T extends { timestamp: string }>(data: T[], keys: readonly (keyof T)[]): T[] {
  const reduced = useReducedMotion(), previous = useRef(data.at(-1)), [animated, setAnimated] = useState<T | undefined>(data.at(-1))
  const latest = data.at(-1), stamp = latest?.timestamp
  useLayoutEffect(() => {
    const from = previous.current, to = latest; previous.current = to
    if (reduced || !from || !to || from.timestamp === to.timestamp) { setAnimated(to); return }
    let frame = 0; const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 200), next = { ...to }
      for (const key of keys) if (typeof from[key] === 'number' && typeof to[key] === 'number') next[key] = (Number(from[key]) + (Number(to[key]) - Number(from[key])) * (1 - (1 - p) ** 3)) as T[keyof T]
      setAnimated(next); if (p < 1) frame = requestAnimationFrame(tick)
    }
    tick(start); return () => cancelAnimationFrame(frame)
  }, [stamp, reduced])
  return animated && latest && animated.timestamp === latest.timestamp ? [...data.slice(0, -1), animated] : data
}
