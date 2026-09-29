# Stage 3 validation

Validated on Windows on 29 September 2026, ATLAS 0.3.0.

- Strict TypeScript checks and the production Electron/Vite build pass.
- All five service suites pass: state transitions/recovery/deduplication/history bounds; classification and official source scope; staggered scheduler/cooldown/start-stop/cancellation; custom input and HTTP error/fallback handling; real endpoint and official adapter checks.
- All six native-network regression suites pass. Real ICMP coverage includes 127.0.0.1, localhost, ::1, 1.1.1.1, 8.8.8.8, google.com, github.com, the invalid domain and unanswered 192.0.2.1. DNS, HTTP, gateway, traceroute and the full diagnostic remain functional.
- The ten-check Stage 2 Electron regression suite passes on Stage 3: secure renderer/preload, real metrics, all navigation, four Quick Actions, Run Diagnostic, invalid input/cancellation, live chart updates, resize behavior, clean console and native close.
- The eight-check Stage 3 Electron suite passes: Services page, custom add/validation/removal, detail/evidence views, search, service-specific staged diagnostics, all eight real defaults, real sparklines, polling idempotence, controlled incident/recovery events, responsive rendering and reduced-motion behavior.
- A temporary loopback endpoint in the test harness returns 200, then 503, then 200. The native service IPC preserves health after one failure, degrades after repeated failures, does not repeat identical incidents, and recovers after two healthy checks. This fixture is not part of the application.
- Default endpoint results in the live service pass: all eight returned HTTP 200 with successful DNS. GitHub and Discord official JSON reported Operational. Cloudflare's official endpoint returned Degraded with old update metadata; ATLAS retained it as dated evidence rather than fresh outage corroboration.
- Native screenshots were inspected at 1440x900, 1920x1080 and 1060x720, including Services and service diagnostics. No horizontal overflow. Smaller windows retain vertical scrolling. The approved coastal background SHA-256 remains E955B9E092DAB1336D7B5445B46B88C2BA5617827F11255831B907BA3181CD39.
- Motion validation covers timing tokens, tabular numeric layout, actual page/modal interactions, status/point updates, native details expansion and reduced-motion CSS. A sampled rendering trace with monitoring active had a median frame interval around 6 ms; this is a local observation, not a universal frame-rate guarantee.
- Development validation also passes on the final source: native Ping/full diagnostic, service detail and Overview, and a real service update sampled at ~6.1 ms median / 6.5 ms p95 frame interval (12.3 ms maximum, no frames over 50 ms). Active tracert MainWindowHandle was 0, confirming no terminal window. Evidence: `artifacts/dev-validation.json` and `artifacts/stage3-dev-validation.json`.
- Renderer console: no errors or warnings. Main process: only the deliberately rejected invalid-URL/input cases during tests; no unexpected runtime errors.

Artifacts:

- `artifacts/services-validation.json` — actual endpoint, DNS, HTTP and official provider results.
- `artifacts/stage3-desktop-validation.json` — IPC/UI checks, incident/recovery snapshots, progress stages and frame timing.
- `artifacts/stage3-overview.png`, `stage3-services-1440.png`, `stage3-services-1060.png`, `stage3-service-detail.png`, `stage3-service-diagnostic.png`.
- `artifacts/network-validation.json` and `artifacts/stage2-desktop-validation.json` — native and Stage 2 UI regression evidence.

Reproduce with `npm run build`, `npm run test:network`, `npm run test:services`, `npm run test:desktop`, and `npm run test:services-desktop`. Build before desktop tests. Tests close their own Electron instance and temporary fixture servers. Real external results can change, and rate/route conditions vary. Automated tests do not disable the user's adapter or manufacture a global service outage. Official-source failures and missing evidence are additionally covered by deterministic fixtures.

No database, notifications, tray, startup registration, installer, updater or export was implemented. No animation dependency was added. See [STAGE3.md](STAGE3.md) for thresholds, limitations and manual testing.

---

# Stage 2 validation

Validated on Windows on 29 September 2026. The native suite passed all six tests, and the Electron suite passed the following checks against the compiled application:

- Strict TypeScript and production build.
- Native Electron / React launch and isolated, sandboxed renderer with no Node exposure.
- Actual gateway detection and live latency, loss, jitter and DNS timing via main/preload IPC.
- Ping, DNS, HTTP and Traceroute through the visible Quick Action dialogs.
- Run Diagnostic's complete gateway, two public ICMP targets, DNS and HTTPS sequence.
- Invalid input rejection, invalid-hostname results and native cancellation without renderer failure.
- Multiple real chart points, selectors, tooltips and no duplicated batches after repeated start calls/navigation.
- 1440×900, 1920×1080 and 1060×720 layout inspection; approved Stage 1 shell preserved.
- No renderer console errors or warnings. Main-process logs contained only the intentional validation-rejection error from the injection-string test, with no unexpected runtime failures.
- The development renderer passed with live loopback ping and the full diagnostic. During a running traceroute, its native Windows MainWindowHandle was verified as 0 (no terminal window).

Live host coverage: `127.0.0.1`, `localhost`, `::1`, `1.1.1.1`, `8.8.8.8`, `google.com`, `github.com`, `does-not-exist.atlas.invalid` and unanswered `192.0.2.1`. Public ICMP replies, A/AAAA lookups, HTTPS 200 responses, a detected Wi-Fi gateway and loopback traceroute all worked during validation. Results are environment-specific.

Deterministic coverage: ICMP JSON decoding, loss/min/max/mean/jitter (including zero RTT and missing replies), traceroute timeouts/IPv6/upper bounds/fallback, command-injection-like inputs, 720-point history cap, idempotent start/stop/restart, HTTP redirects and status semantics, local-server timeout, refusal and cancellation. Local fixture servers exist only in tests, not the application.

Artifacts: `artifacts/network-validation.json`, `artifacts/stage2-desktop-validation.json`, `artifacts/stage2-overview-1440.png`, and diagnostic screenshots under `artifacts/stage2-*.png`.

Commands: `npm run typecheck`, `npm run build`, `npm run test:network`, `npm run test:desktop`. Test Electron uses an isolated cache after an initial cache collision with an existing development instance. No installer was built. Automated tests did not physically disconnect the user's network; offline behavior is covered by explicit failure fixtures and a manual test recipe in README.

---

# Stage 1 validation (historical)

Validated on Windows on 29 September 2026 using the installed Electron runtime and real native BrowserWindows.

| Check | Result |
| --- | --- |
| Dependency installation | Passed; npm reported 0 vulnerabilities |
| Strict TypeScript: main, preload, renderer | Passed |
| Production build | Passed |
| Electron launch / React renderer | Passed |
| Preload app metadata | Version 0.1.0, win32, demo |
| Renderer isolation | nodeIntegration false; contextIsolation true; sandbox true |
| Renderer Node exposure | Neither window.require nor window.process is available |
| Metrics and services | Four metric cards, eight service rows |
| Recharts | Four series, tooltips, metric switching, units, time filtering |
| Navigation | All seven sidebar routes; Services and History View all links |
| Preview interactions | All four quick actions and Run Diagnostic |
| Keyboard | Ctrl+K search, Enter preview, Escape, dialog focus restoration |
| Native controls | Minimize, maximize, restore and close |
| Native resizing | 1440×900, 1920×1080, 1280×800, 1060×720 |
| Layout | No horizontal overflow or panels outside viewport bounds |
| Production renderer console | No errors or warnings during tested flows |
| Production external HTTP requests | None during tested flows |
| Development launch | npm run dev starts Vite and Electron |
| Development renderer console | No errors or warnings during inspected flows |
| Visual inspection | Native screenshots compared against supplied concept |
| Installer packaging | Deliberately not run |

The layout preserves the concept's fixed left navigation, coastal background, four metric cards, large chart and service status row, and bottom health/events/actions panels. The background is a separately generated Iceland-inspired image, not the exact reference photo. Smaller windows scroll vertically; at 1060px quick actions move below health and events.

Reproduce with `npm run build` followed by `npm run test:desktop`. The script launches an independent Electron window, tests the compiled app, captures screenshots and closes that window. Results are written to `artifacts/validation.json` and screenshots to `artifacts/atlas-<width>x<height>.png`.

For optional development-console inspection, run `npm run dev -- --remoteDebuggingPort 9223`, then `node scripts/inspect-dev.mjs`. Normal use is simply `npm run dev`; it does not enable remote debugging.

These checks validate Stage 1 UI behavior, not network accuracy, release packaging, installer signing or Stage 2 diagnostics.
