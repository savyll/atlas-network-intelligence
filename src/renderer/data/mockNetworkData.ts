export type PageName = 'Overview' | 'Services' | 'Diagnostics' | 'Targets' | 'History' | 'Reports' | 'Settings'
export type MetricName = 'Latency' | 'Packet Loss' | 'Jitter' | 'DNS Response'
export type TimeRange = 'Last 6 hours' | 'Last 3 hours' | 'Last hour'
export type Status = 'Operational' | 'Degraded' | 'Outage'

export const destinations = [
  { key: 'newYork', name: 'New York', color: '#e9be72' },
  { key: 'london', name: 'London', color: '#ae91d4' },
  { key: 'tokyo', name: 'Tokyo', color: '#8595af' },
  { key: 'singapore', name: 'Singapore', color: '#72c397' }
] as const

const curves = {
  newYork: [55, 61, 73, 70, 81, 105, 86, 68, 48, 51, 42, 38, 20, 28, 40, 62, 47, 58, 63],
  london: [37, 42, 43, 48, 64, 58, 57, 71, 82, 75, 91, 77, 65, 59, 76, 89, 64, 84, 90],
  tokyo: [31, 32, 28, 39, 42, 35, 32, 40, 43, 54, 50, 57, 64, 77, 65, 56, 53, 68, 62],
  singapore: [26, 28, 24, 25, 34, 41, 29, 33, 38, 31, 39, 33, 21, 23, 26, 17, 21, 36, 34]
}

// Deterministic fixtures: no requests, timers, randomness or native measurements.
export function getChartData(metric: MetricName, range: TimeRange) {
  const factor = metric === 'Packet Loss' ? 0.009 : metric === 'Jitter' ? 0.14 : metric === 'DNS Response' ? 1.23 : 1
  const points = Array.from({ length: 73 }, (_, i) => {
    const minutes = 360 + i * 5
    const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
    const values = Object.fromEntries(destinations.map(({ key }, index) => {
      const start = Math.floor(i / 4)
      const next = Math.min(start + 1, 18)
      const base = curves[key][start] + (curves[key][next] - curves[key][start]) * (i % 4) / 4
      const detail = i % 4 === 0 ? 0 : Math.sin(i * 2.4 + index) * 2.1
      return [key, Number(((base + detail) * factor).toFixed(metric === 'Packet Loss' ? 2 : 0))]
    })) as Record<(typeof destinations)[number]['key'], number>
    return { time, ...values }
  })
  return points.slice(range === 'Last hour' ? -13 : range === 'Last 3 hours' ? -37 : 0)
}

export const sparkValues = [8, 10, 9, 14, 12, 18, 15, 21, 16, 19, 14, 24, 19, 27, 24, 30, 26, 34]
export const metrics: { name: MetricName; value: string; unit: string; trend: string; color: string; values: number[] }[] = [
  { name: 'Latency', value: '24', unit: 'ms', trend: '18%', color: '#72c397', values: sparkValues },
  { name: 'Packet Loss', value: '0.3', unit: '%', trend: '52%', color: '#d57576', values: [3, 6, 8, 7, 15, 8, 21, 5, 12, 9, 30, 11, 21, 15, 25, 19, 28, 36] },
  { name: 'Jitter', value: '4', unit: 'ms', trend: '22%', color: '#ae91d4', values: [8, 10, 9, 12, 15, 11, 16, 13, 25, 12, 18, 10, 17, 20, 18, 22, 27, 32] },
  { name: 'DNS Response', value: '31', unit: 'ms', trend: '12%', color: '#e9be72', values: [4, 6, 10, 9, 17, 14, 18, 22, 19, 23, 35, 25, 21, 25, 30, 28, 35, 42] }
]

// Historical Stage 1 DEMO fixtures. Stage 3 service monitoring does not consume this array.
export const services: { name: string; status: Status; color: string; values: number[] }[] = [
  { name: 'YouTube', status: 'Operational', color: '#ee4d5a', values: [7, 9, 13, 12, 15, 13, 12, 14, 11, 10, 12, 10, 11, 13, 12, 14] },
  { name: 'Discord', status: 'Operational', color: '#a697ef', values: [5, 7, 7, 10, 8, 9, 12, 8, 7, 9, 8, 6, 7, 9, 8, 10] },
  { name: 'Spotify', status: 'Degraded', color: '#66cd88', values: [6, 8, 7, 12, 8, 9, 16, 8, 29, 11, 13, 8, 10, 9, 11, 8] },
  { name: 'Steam', status: 'Operational', color: '#a9b7c8', values: [4, 5, 9, 12, 9, 7, 10, 6, 7, 9, 6, 5, 8, 7, 9, 8] },
  { name: 'GitHub', status: 'Operational', color: '#e9e9ec', values: [7, 9, 10, 15, 11, 13, 8, 11, 9, 10, 15, 11, 9, 11, 10, 13] },
  { name: 'Cloudflare', status: 'Operational', color: '#e9a564', values: [4, 6, 5, 9, 6, 10, 7, 20, 6, 9, 5, 7, 5, 6, 5, 4] },
  { name: 'Google', status: 'Operational', color: '#88acb1', values: [4, 5, 4, 8, 6, 10, 8, 19, 9, 8, 10, 7, 8, 6, 5, 4] },
  { name: 'Microsoft', status: 'Operational', color: '#9da9b7', values: [4, 6, 5, 9, 7, 10, 5, 8, 6, 7, 17, 8, 7, 9, 6, 7] }
]

export const recentEvents = [
  { time: '11:09 AM', message: 'Latency spike detected', detail: '112 ms', status: 'outage' },
  { time: '10:56 AM', message: 'Packet loss above threshold', detail: '1.4%', status: 'degraded' },
  { time: '10:43 AM', message: 'DNS response improved', detail: '28 ms', status: 'operational' },
  { time: '10:21 AM', message: 'Connection restored', detail: '—', status: 'operational' },
  { time: '09:58 AM', message: 'YouTube partial outage', detail: '—', status: 'outage' }
] as const

export const sampleTargets = [
  { name: 'Cloudflare DNS', address: '1.1.1.1', location: 'Global' },
  { name: 'Google DNS', address: '8.8.8.8', location: 'Global' },
  { name: 'GitHub', address: 'github.com', location: 'San Francisco' },
  { name: 'London', address: 'london.example.com', location: 'United Kingdom' }
]
