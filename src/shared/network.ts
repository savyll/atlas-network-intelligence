export type HealthState = 'Good' | 'Degraded' | 'Unavailable' | 'Unknown'
export interface ResultBase { timestamp: string; success: boolean; error: string | null; cancelled: boolean }
export interface PingSample { sequence: number; latency: number | null; status: string }
export interface PingResult extends ResultBase {
  kind: 'ping'; target: string; resolvedAddress: string | null; sent: number; received: number; lost: number;
  packetLossPercent: number | null; minimumLatency: number | null; maximumLatency: number | null;
  averageLatency: number | null; jitter: number | null; samples: PingSample[]
}
export interface DnsResult extends ResultBase { kind: 'dns'; domain: string; ipv4: string[]; ipv6: string[]; duration: number; ipv4Error: string | null; ipv6Error: string | null }
export interface HttpRedirect { url: string; status: number; location: string }
export interface HttpCheckResult extends ResultBase {
  kind: 'http'; url: string; finalUrl: string; statusCode: number | null; statusText: string;
  duration: number; reachable: boolean; https: boolean; outcome: string; redirects: HttpRedirect[]; method?: 'HEAD' | 'GET'
}
export interface TracerouteHop { hop: number; address: string | null; latencies: (number | null)[]; belowOneMillisecond: boolean[]; timeout: boolean; unparsed?: string }
export interface TracerouteResult extends ResultBase { kind: 'traceroute'; target: string; resolvedAddress: string | null; hops: TracerouteHop[]; reached: boolean; timedOut: boolean }
export interface GatewayResult extends ResultBase { kind: 'gateway'; address: string | null; interfaceName: string | null; interfaceIndex: number | null; family: 4 | 6 | null; hasLocalInterface: boolean }
export interface NetworkHealth { score: number | null; localNetwork: HealthState; internet: HealthState; dns: HealthState; summary: string; rules: string[] }
export interface DiagnosticSummary extends ResultBase { kind: 'diagnostic'; gateway: GatewayResult; gatewayPing: PingResult | null; publicPings: PingResult[]; dns: DnsResult; http: HttpCheckResult; health: NetworkHealth }
export type DiagnosticResult = PingResult | DnsResult | HttpCheckResult | TracerouteResult | DiagnosticSummary | GatewayResult
export interface DiagnosticRequest { requestId: string; target: string }
export interface PingRequest extends DiagnosticRequest { count?: number }
export interface HistoryPoint { timestamp: string; cloudflare: number | null; google: number | null; packetLoss: number | null; jitter: number | null; dns: number | null }
export interface NetworkEvent { timestamp: string; message: string; detail: string; status: 'operational' | 'degraded' | 'outage' }
export interface MonitorSnapshot {
  running: boolean; measuring: boolean; cycles: number; updatedAt: string | null; error: string | null;
  latency: number | null; packetLoss: number | null; jitter: number | null; dnsDuration: number | null;
  health: NetworkHealth; latest: DiagnosticSummary | null; history: HistoryPoint[]; events: NetworkEvent[]
}
export interface NetworkAPI {
  ping: (request: PingRequest) => Promise<PingResult>
  dns: (request: DiagnosticRequest) => Promise<DnsResult>
  http: (request: DiagnosticRequest) => Promise<HttpCheckResult>
  traceroute: (request: DiagnosticRequest) => Promise<TracerouteResult>
  gateway: (requestId: string) => Promise<GatewayResult>
  diagnose: (requestId: string) => Promise<DiagnosticSummary>
  cancel: (requestId: string) => Promise<boolean>
  startMonitoring: () => Promise<MonitorSnapshot>
  getSnapshot: () => Promise<MonitorSnapshot>
  onSnapshot: (callback: (snapshot: MonitorSnapshot) => void) => () => void
  onProgress: (callback: (progress: import('./services').DiagnosticProgress) => void) => () => void
}
