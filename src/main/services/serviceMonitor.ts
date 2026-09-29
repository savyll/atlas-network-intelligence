import type { NetworkBaseline, ServiceCheckResult, ServiceDefinition, ServiceSnapshot, ServicesSnapshot } from '../../shared/services'
import type { NetworkEvent } from '../../shared/network'
import { timestamp } from '../network/native'
import { checkService } from './serviceChecker'
import { classify, nextStatus } from './classification'
import { customService, defaultServices } from './serviceRegistry'

export function initialService(definition: ServiceDefinition): ServiceSnapshot {
  return { definition, status: 'Unknown', checking: false, latest: null, history: [], availability: null, lastSuccessfulCheck: null,
    consecutiveFailures: 0, consecutiveSuccesses: 0, classification: { kind: 'UNKNOWN', explanation: 'Waiting for completed checks.' } }
}
export class ServiceMonitor {
  private services = new Map(defaultServices.map(definition => [definition.id, initialService(definition)]))
  private events: NetworkEvent[] = []
  private due = new Map<string, number>()
  private active = new Map<string, { controller: AbortController; promise: Promise<ServiceSnapshot> }>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false
  constructor(private publish: (snapshot: ServicesSnapshot) => void, private baseline: () => NetworkBaseline,
    private measure: typeof checkService = checkService) {}
  snapshot(): ServicesSnapshot { return { running: this.running, services: [...this.services.values()], events: this.events } }
  get(id: string) { const value = this.services.get(id); if (!value) throw new Error('Service not found.'); return value }
  private emit() { this.publish(this.snapshot()) }
  start() {
    if (this.running) return this.snapshot()
    this.running = true
    let index = 0
    for (const id of this.services.keys()) this.due.set(id, Date.now() + 5000 + index++ * 3500)
    this.schedule(); this.emit(); return this.snapshot()
  }
  stop() {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    for (const job of this.active.values()) job.controller.abort()
    this.emit()
  }
  private schedule() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (!this.running || this.active.size || !this.due.size) return
    const [id, due] = [...this.due.entries()].sort((a, b) => a[1] - b[1])[0]
    this.timer = setTimeout(() => { this.timer = null; void this.check(id).catch(() => {}).finally(() => this.schedule()) }, Math.max(250, due - Date.now()))
  }
  add(input: unknown) {
    if (this.services.size >= 20) throw new Error('This session supports up to 12 custom monitors.')
    const definition = customService(input)
    if ([...this.services.values()].some(service => new URL(service.definition.checkUrl).href === definition.checkUrl)) throw new Error('This endpoint is already monitored.')
    const value = initialService(definition); this.services.set(definition.id, value)
    this.due.set(definition.id, Date.now() + 1000); this.schedule(); this.emit(); return value
  }
  remove(id: string) {
    if (!this.get(id).definition.custom) throw new Error('Default services cannot be removed.')
    this.active.get(id)?.controller.abort(); this.services.delete(id); this.due.delete(id); this.schedule(); this.emit()
  }
  /** All requests, including manual ones, share this in-flight job and 15s minimum interval. */
  check(id: string, signal?: AbortSignal, stage?: Parameters<typeof checkService>[2]): Promise<ServiceSnapshot> {
    const value = this.get(id), existing = this.active.get(id)
    if (signal?.aborted) return Promise.resolve(value)
    if (existing) {
      if (!signal) return existing.promise
      // Cancelling a diagnostic must not wait for (or abort) a shared background check.
      return new Promise((resolve, reject) => {
        const abort = () => { signal.removeEventListener('abort', abort); resolve(this.services.get(id) ?? value) }
        signal.addEventListener('abort', abort, { once: true })
        existing.promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
      })
    }
    if (value.latest && Date.now() - Date.parse(value.latest.timestamp) < 15000) {
      this.due.set(id, Date.parse(value.latest.timestamp) + value.definition.intervalMs)
      stage?.('Official Status'); return Promise.resolve(value)
    }
    if (this.active.size >= 2) return Promise.reject(new Error('Two service checks are already running. Please wait.'))
    const controller = new AbortController(), abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    value.checking = true; this.emit()
    const promise = this.measure(value.definition, controller.signal, stage).then(result => {
      if (!controller.signal.aborted && this.services.has(id)) this.accept(id, result)
      return this.services.get(id) ?? value
    }).finally(() => {
      signal?.removeEventListener('abort', abort); this.active.delete(id)
      const current = this.services.get(id)
      if (current) { current.checking = false; this.due.set(id, Date.now() + current.definition.intervalMs) }
      this.emit(); this.schedule()
    })
    this.active.set(id, { controller, promise }); return promise
  }
  accept(id: string, check: ServiceCheckResult) {
    if (check.cancelled) return
    const previous = this.get(id)
    const failures = check.assessment === 'failure' ? previous.consecutiveFailures + 1 : 0
    const successes = check.assessment === 'success' && (check.responseTime ?? Infinity) <= 2000 ? previous.consecutiveSuccesses + 1 : 0
    const history = [...previous.history, { timestamp: check.timestamp, responseTime: check.responseTime, available: check.assessment === 'inconclusive' ? null : check.assessment === 'success' }].slice(-60)
    const measured = history.filter(point => point.available !== null)
    const current: ServiceSnapshot = { ...previous, latest: check, history, consecutiveFailures: failures, consecutiveSuccesses: successes,
      status: nextStatus(previous, check, failures, successes, this.baseline()),
      availability: measured.length ? Math.round(measured.filter(point => point.available).length / measured.length * 1000) / 10 : null,
      lastSuccessfulCheck: check.assessment === 'success' ? check.timestamp : previous.lastSuccessfulCheck }
    this.services.set(id, current)
    const failingPeers = [...this.services.values()].filter(service => !service.definition.custom && service.consecutiveFailures >= 2 && service.latest && Date.now() - Date.parse(service.latest.timestamp) < 120000).length
    current.classification = classify(current, this.baseline(), failingPeers)
    const incident = current.status === 'Degraded' || current.status === 'Major Outage'
    const recovered = current.status === 'Operational' && ['Degraded', 'Major Outage'].includes(previous.status)
    if (previous.status !== current.status && (incident || recovered)) this.addEvent(`${current.definition.displayName} ${recovered ? 'recovered' : current.status === 'Degraded' ? 'degraded' : 'endpoint outage'}`, current.status === 'Major Outage' ? 'outage' : recovered ? 'operational' : 'degraded', check.http.statusCode ? `HTTP ${check.http.statusCode}` : !check.dns.success ? 'DNS failed' : 'Unreachable')
    const before = previous.latest?.official, after = check.official
    if (before?.available && after?.available && before.status !== after.status) this.addEvent(`${current.definition.displayName} official status changed`, after.status === 'Operational' ? 'operational' : 'degraded', after.status)
    this.emit()
  }
  private addEvent(message: string, status: NetworkEvent['status'], detail: string) {
    this.events = [{ timestamp: timestamp(), message, status, detail }, ...this.events].slice(0, 40)
  }
}
