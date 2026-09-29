import type { GatewayResult, MonitorSnapshot } from '../../shared/network'
import { unknownHealth, publicMetrics } from './health'
import { runDiagnostic } from './diagnostics'
import { errorMessage } from './native'

export const MONITOR_INTERVAL = 30000
export const HISTORY_LIMIT = 720
/** Main-process singleton. Scheduling happens only after the prior cycle settles. */
export class NetworkMonitor {
  private timer: ReturnType<typeof setTimeout> | null = null
  private controller: AbortController | null = null
  private gateway: GatewayResult | undefined
  private gatewayTime = 0
  private state: MonitorSnapshot = { running: false, measuring: false, cycles: 0, updatedAt: null, error: null, latency: null, packetLoss: null, jitter: null, dnsDuration: null, health: unknownHealth(), latest: null, history: [], events: [] }
  constructor(private publish: (snapshot: MonitorSnapshot) => void, private busy: () => boolean, private measure: typeof runDiagnostic = runDiagnostic) {}
  snapshot(): MonitorSnapshot { return this.state }
  start(): MonitorSnapshot {
    if (!this.state.running) { this.state = { ...this.state, running: true }; this.schedule(2500) }
    return this.state
  }
  stop(): void {
    this.state = { ...this.state, running: false, measuring: false }
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.controller?.abort()
    this.controller = null
  }
  private schedule(delay: number): void {
    if (this.state.running) this.timer = setTimeout(() => { this.timer = null; void this.cycle() }, delay)
  }
  private async cycle(): Promise<void> {
    if (!this.state.running) return
    if (this.busy()) { this.schedule(MONITOR_INTERVAL); return }
    const controller = new AbortController()
    this.controller = controller
    this.state = { ...this.state, measuring: true }; this.publish(this.state)
    try {
      const cached = this.gateway && Date.now() - this.gatewayTime < 300000 ? this.gateway : undefined
      const result = await this.measure(controller.signal, 3, cached)
      if (controller.signal.aborted || !this.state.running) return
      if (!cached) { this.gateway = result.gateway.success ? result.gateway : undefined; this.gatewayTime = Date.now() }
      const metrics = publicMetrics(result.publicPings)
      const dnsDuration = result.dns.success ? result.dns.duration : null
      const previous = this.state.health
      const changed = this.state.cycles === 0 || previous.internet !== result.health.internet || previous.dns !== result.health.dns || previous.localNetwork !== result.health.localNetwork
      const events = changed ? [{ timestamp: result.timestamp, message: this.state.cycles === 0 ? 'First measurements completed' : 'Connection health changed', detail: result.health.score === null ? 'Unknown' : `${result.health.score}/100`, status: result.success ? 'operational' as const : 'degraded' as const }, ...this.state.events].slice(0, 30) : this.state.events
      this.state = { ...this.state, ...metrics, dnsDuration, cycles: this.state.cycles + 1, updatedAt: result.timestamp, error: null, latest: result, health: result.health, events,
        history: [...this.state.history, { timestamp: result.timestamp, cloudflare: result.publicPings[0].averageLatency, google: result.publicPings[1].averageLatency, packetLoss: metrics.packetLoss, jitter: metrics.jitter, dns: dnsDuration }].slice(-HISTORY_LIMIT) }
    } catch (error) { if (this.controller === controller && !controller.signal.aborted) this.state = { ...this.state, error: errorMessage(error), health: unknownHealth(), latency: null, packetLoss: null, jitter: null, dnsDuration: null } }
    finally {
      if (this.controller !== controller) return
      this.controller = null
      this.state = { ...this.state, measuring: false }
      if (this.state.running) { this.publish(this.state); this.schedule(MONITOR_INTERVAL) }
    }
  }
}
