import type { DiagnosticSummary, DnsResult, HttpCheckResult, MonitorSnapshot, NetworkEvent } from './network'

export type ServiceStatus = 'Operational' | 'Degraded' | 'Major Outage' | 'Unknown'
export type ClassificationKind = 'SERVICE HEALTHY' | 'LIKELY LOCAL NETWORK ISSUE' | 'LIKELY ISP / UPSTREAM ISSUE' | 'LIKELY DNS ISSUE' | 'LIKELY SERVICE-SIDE ISSUE' | 'DEGRADED / AMBIGUOUS' | 'UNKNOWN'
export interface OutageClassification { kind: ClassificationKind; explanation: string }
export interface ServiceDefinition {
  id: string; displayName: string; homepageUrl: string; checkUrl: string; domain: string;
  icon: string; color: string; provider: 'github' | 'discord' | 'cloudflare' | null;
  intervalMs: number; timeoutMs: number; custom: boolean
}
export interface ServiceStatusProviderResult {
  provider: string; sourceUrl: string; fetchedAt: string; updatedAt: string | null;
  status: ServiceStatus; description: string; available: boolean; error: string | null
}
export interface ServiceCheckResult {
  timestamp: string; dns: DnsResult; http: HttpCheckResult; responseTime: number | null;
  assessment: 'success' | 'failure' | 'inconclusive'; reason: string;
  official: ServiceStatusProviderResult | null; cancelled: boolean
}
export interface ServiceHistoryPoint { timestamp: string; responseTime: number | null; available: boolean | null }
export interface ServiceSnapshot {
  definition: ServiceDefinition; status: ServiceStatus; checking: boolean; latest: ServiceCheckResult | null;
  history: ServiceHistoryPoint[]; availability: number | null; lastSuccessfulCheck: string | null;
  consecutiveFailures: number; consecutiveSuccesses: number; classification: OutageClassification
}
export interface ServicesSnapshot { running: boolean; services: ServiceSnapshot[]; events: NetworkEvent[] }
export type DiagnosticStage = 'Local Network' | 'Internet' | 'DNS' | 'Service Endpoint' | 'Official Status' | 'ATLAS Conclusion'
export interface DiagnosticProgress { requestId: string; stage: DiagnosticStage }
export interface ServiceDiagnostic { service: ServiceSnapshot; network: DiagnosticSummary; timestamp: string; cancelled: boolean }
export interface ServicesAPI {
  list: () => Promise<ServicesSnapshot>
  get: (id: string) => Promise<ServiceSnapshot>
  add: (input: { name: string; url: string }) => Promise<ServiceSnapshot>
  remove: (id: string) => Promise<void>
  check: (id: string) => Promise<ServiceSnapshot>
  diagnose: (input: { id: string; requestId: string }) => Promise<ServiceDiagnostic>
  cancel: (requestId: string) => Promise<boolean>
  start: () => Promise<ServicesSnapshot>
  stop: () => Promise<void>
  onSnapshot: (callback: (snapshot: ServicesSnapshot) => void) => () => void
  onProgress: (callback: (progress: DiagnosticProgress) => void) => () => void
}
export type NetworkBaseline = Pick<MonitorSnapshot, 'updatedAt' | 'latest'>
