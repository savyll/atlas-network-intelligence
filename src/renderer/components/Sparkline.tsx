import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from './motion'
interface Props { values: (number | null)[]; color?: string; className?: string }
export function Sparkline({ values, color = 'var(--green)', className = '' }: Props) {
  const reduced = useReducedMotion(), previous = useRef<(number | null)[]>(values), [tail, setTail] = useState<number | null>(values.at(-1) ?? null)
  const signature = values.join(',')
  useEffect(() => {
    const from = previous.current.at(-1), to = values.at(-1) ?? null
    previous.current = values
    if (reduced || from == null || to == null || from === to) { setTail(to); return }
    let frame = 0; const start = performance.now()
    const tick = (now: number) => { const p = Math.min(1, (now - start) / 200); setTail(from + (to - from) * (1 - (1 - p) ** 3)); if (p < 1) frame = requestAnimationFrame(tick) }
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame)
  }, [signature, reduced])
  const max = Math.max(0, ...values.filter((value): value is number => value !== null)) + 3
  let gap = true
  const path = values.map((value, index) => {
    if (value === null) { gap = true; return '' }
    const point = `${gap ? 'M' : 'L'}${index * 100 / Math.max(1, values.length - 1)},${38 - (index === values.length - 1 ? tail ?? value : value) / max * 34}`
    gap = false; return point
  }).join(' ')
  return <svg className={`sparkline ${className}`} viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><path d={path} fill="none" stroke={color} strokeWidth="1.2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />{values.length === 1 && values[0] !== null && <circle cx="0" cy={38 - values[0] / max * 34} r="1.5" fill={color} />}</svg>
}
