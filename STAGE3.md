# ATLAS Stage 3

The approved Overview, background, sidebar, typography, colors and native diagnostics are preserved. Service Status is now real. Services is a functional session monitor with details, custom endpoints and a service-specific diagnostic.

## Checks and sources

Default monitors: YouTube, Discord, Spotify, Steam, GitHub, Cloudflare, Google and Microsoft. Definitions live in `src/main/services/serviceRegistry.ts`; the renderer receives them through typed IPC. Custom names and HTTP(S) URLs are validated; credentials, unsupported schemes and control characters are rejected. Up to 12 custom services can be added and removed in one session.

Each check performs A/AAAA DNS resolution and an HTTP(S) HEAD request. Literal IPs skip DNS and report a zero-duration, successful resolution step (no actual DNS lookup). If HEAD returns 403, 405 or 501, a single lightweight GET is attempted; it requests a one-byte range and destroys the response at its headers even if the server ignores that range. No response body is buffered. TLS verification stays enabled. Response timing includes connection establishment and redirects, up to five redirects within an eight-second HTTP deadline. DNS has a separate five-second bound.

HTTP 401, 403, 405, 429 and 501 after fallback are **inconclusive access/capability responses**, not outage proof. Other 4xx responses describe an endpoint/resource problem; 5xx responses supply server-error evidence. DNS failures, timeouts, refusal, TLS failures and redirect errors return structured failures without crashing the app. A check succeeds when both DNS and HTTP succeed.

Official adapters use these verified public Statuspage JSON endpoints:

- [GitHub Status](https://www.githubstatus.com/api/v2/status.json)
- [Discord Status](https://discordstatus.com/api/v2/status.json)
- [Cloudflare Status](https://www.cloudflarestatus.com/api/v2/status.json)

Official results (including errors) are cached for five minutes. Requests have a six-second deadline and a 64 KB body cap. Invalid JSON or unavailable providers never disable synthetic checks. Detail views show the description, source, retrieval time and provider update time. An incident whose update metadata is older than 24 hours is shown as evidence but cannot corroborate an outage. This conservatism can miss long-running real incidents; a recently retrieved status page is not automatically a recently updated incident. Official scope can cover products/regions beyond the directly checked homepage. The other five services and custom monitors have no official provider configured.

## State rules and classification

Rules are documented and tested in `classification.ts`:

| Evidence | State |
| --- | --- |
| No results, a single first success, or access restrictions | Unknown (existing incidents remain latched pending recovery) |
| Two consecutive successful checks at ≤2 seconds | Operational; also required for recovery |
| One failure after established health | Retain prior state; explanation says evidence is not yet sufficient |
| Two consecutive failures, or two consecutive responses >2 seconds | Degraded |
| Recent official minor/major incident, without confirming direct failures | Degraded with official-scope caveat |
| Two direct failures plus a recent official major incident | Major Outage |
| Four direct failures, last two HTTP 5xx, target DNS succeeds, and fresh healthy gateway/public-IP/DNS baseline | Major Outage for the measured endpoint |

401/403/405/429/501 outcomes break streaks and are excluded from availability. Availability is successful paired DNS/HTTP checks divided by assessed checks within the last 60 samples. Failed responses can retain their real HTTP duration; transport failures are gaps, not invented zeroes. Slow but reachable checks count as available. Cancellation creates no observation or incident.

The classifier compares service evidence with a connection baseline no older than two minutes. It distinguishes healthy endpoint, likely local interface problem, likely upstream problem, likely DNS problem, likely service-side issue, ambiguous evidence and unknown evidence. Public-IP failure alone is not an upstream diagnosis: the independent HTTP connectivity test must fail too. A missing gateway ping alone does not identify a local issue because ICMP may be filtered. Repeated target HTTP 5xx/official incidents with working independent connectivity support a likely service-side issue. Explanations never claim a verified global outage or exact cause.

Service diagnostics run four ICMP probes per gateway/public target and show stages: Local Network → Internet → DNS → Service Endpoint → Official Status → ATLAS Conclusion. The conclusion is evaluated using that diagnostic's fresh connection results. Recent service checks can be reused; their actual timestamps remain visible. Cancel/Escape aborts the diagnostic. If it joins a service check already running for the scheduler, that shared check may finish independently.

## Scheduling, lifecycle and events

- One app-level service scheduler starts five seconds after renderer subscription. Initial services are staggered 3.5 seconds apart; slow checks run sequentially rather than forming an unbounded queue.
- Each service becomes due 60 seconds after its previous completion; queueing can make intervals longer. Up to two concurrent service checks are permitted, including manual checks. Duplicate in-flight requests coalesce. Results younger than 15 seconds are reused.
- Native diagnostic requests share Stage 2's two-job limit. At most one service-specific full diagnostic can run at once.
- Repeated start, navigation and React StrictMode cannot create another loop. Stop/window close/app quit clear timers and abort active checks. Histories (60 points/service) and events (40 service + 30 connection events) are bounded in memory. Custom monitors and history disappear on exit.
- Degradation, escalation, recovery and official state transitions create events. Identical repeated polling results do not. The Overview merges actual connection and service events by time.
- The monitored-services health row aggregates real statuses. The numeric connection score retains Stage 2's documented measurement rules; it does not invent service-score weights.

## IPC

`window.atlas.services` maps to `atlas:services:list`, `get`, `add`, `remove`, `check`, `diagnose`, `cancel`, `start`, `stop`, plus `snapshot` and `progress` events. `window.atlas.network.onProgress` adds the `atlas:network:progress` event to the existing network API. Event subscriptions return cleanup functions. `src/shared/services.ts` contains the contracts. Every invocation validates the trusted top-level renderer and runtime input. No generic fetch, shell, process or filesystem interface is exposed. All external requests execute in main; renderer CSP still disallows external connections.

## Motion

No additional animation dependency. Shared CSS tokens use `cubic-bezier(.22,1,.36,1)`:

- Buttons/sidebar: 150 ms color/border and tiny press response.
- Metric hover: 1 px lift and 220 ms border transition.
- Navigation: 260 ms fade with 4 px translation; stationary sidebar and stable content wrapper.
- Numeric changes: 160 ms ease-out with tabular figures; no idle counting.
- Chart/sparkline: 200 ms interpolation of the newest point only; history entrance animation is disabled, missing samples remain gaps.
- Status dots/colors: 220 ms; labels fade for 180 ms without flashing rows.
- Dialog: 240 ms subtle opacity/translation/scale opening; 160 ms closing. Restrained 2 px backdrop blur is static, not repeatedly animated.
- Native details expansion and diagnostic stage changes use the same timing system.

`prefers-reduced-motion` disables CSS animation/transitions and bypasses numeric/chart interpolation. JavaScript animation frames exist only during short data updates and are cancelled on cleanup. No perpetual decorative animations, animation package or heavy blur loop was introduced.

## Testing and limitations

Run from the project folder:

```powershell
npm run dev
# In a separate terminal, after closing the dev instance for isolated validation:
npm run build
npm run test:network
npm run test:services
npm run test:desktop
npm run test:services-desktop
```

The service tests cover all eight real default endpoints, official JSON, the reserved invalid domain, invalid custom URLs, fallback GET, 4xx/5xx, timeout, refusal, redirects, hysteresis, recovery, bounded memory, deduplication and scheduler lifecycle. The desktop suite creates a temporary **test-only** loopback HTTP server, changes 200 → 503 → 200, and verifies real IPC transitions and recovery. There is no HTTP server in the application.

Manual checks:

1. Launch, wait about 90 seconds for two rounds, and inspect Overview/Services. Unknown during warm-up is intentional. Open GitHub and expand endpoint/official evidence.
2. Enter `github.com` in search; choose Open or Run diagnostic. Also enter an unknown hostname for generic Ping, or an HTTP(S) URL for HTTP Check.
3. Add `https://does-not-exist.atlas.invalid`. One failure is unconfirmed; two become Degraded. Its explanation should distinguish target DNS failure from an independently working resolver. Remove it afterwards.
4. Try adding `file:///C:/Windows`; expect a validation message in the dialog.
5. For recovery, run `npm run test:services-desktop`, or monitor an endpoint you control and change its response from 200 to 503 and back. Wait two healthy checks for recovery. Major Outage additionally needs the corroboration in the table above.
6. Disconnect/reconnect your network manually if desired. ATLAS should remain responsive and report incomplete/shared connectivity evidence rather than blaming every service. Automated validation does not disable your adapter.
7. On Windows, turn **Accessibility → Visual effects → Animation effects** off and test navigation, dialogs and metric updates. The automated suite also emulates the reduced-motion media query.

Synthetic checks only represent this machine's route and the configured endpoint. They cannot establish global service health, authenticated feature availability, all regions, browser playback or all IPv6 paths. DNS/OS caches, firewalls, VPNs, TLS interception and unsupported authenticated proxy/PAC setups can affect results. The absolute two-second slow threshold is deliberately simple, not a learned baseline. Official incident metadata can be incomplete or stale. ICMP-blocking networks retain uncertainty. No telemetry, accounts, analytics, cloud sync, notifications, tray, startup integration, database, report export, installer or updater was added.

No displayed Overview/service measurements remain mocked. Stage 1 fixture arrays are retained as unused reference data; metric metadata and navigation types still reuse that file. Targets/History/Reports/Settings remain their existing placeholder pages. Validation evidence is recorded in `VALIDATION.md` and `artifacts/stage3-*.json/png`.
