# Release 0.2.3

### Added
- Startup and runtime performance diagnostics:
- Slow-path tracing for `runPreflight`, `installVariant`, `startApp`, and `openRunPanel`.
- Slow-stage aggregation and ranking (median/p95/max/failures) for insights.
- Top slow stages view in both Startup Profiler and SLO dashboard.
- New test coverage:
- `test/slow-path-metrics.test.js` for slow-path summary logic.
- CI perf budgets:
- Extension parse-time budget check.
- Startup phases count budget check.

### Changed
- Run UX and status consistency:
- One-screen run flow (`Module -> Device -> Variant -> Run`) with clearer primary/secondary actions.
- Progressive disclosure defaults to Beginner mode.
- Unified status semantics and severity styling (`Idle / Running / Failed / Fixed`).
- Empty states now guide users with direct next-step actions.
- Keyboard-first improvements:
- Shortcut hints in UI and profile-based shortcut mapping.
- Performance internals:
- Shared polling scheduler with focus/visibility gating.
- Removed redundant panel/statusbar intervals.
- Deferred/lazy registration of heavy views and language controllers.
- In-flight dedupe + short TTL caches for key ADB/Gradle/preflight paths.
- Webview rendering optimizations:
- Incremental history/timeline updates.
- Render caps for very large lists.
- Artifact export improvements:
- Bounded logcat snapshot size.
- Progress-aware ZIP export flow.

### Fixed
- Reduced noisy notification behavior and improved quiet-mode behavior.
- Improved preflight and run/install diagnostics to reduce silent failures.
- Kotlin/Java runtime guardrails (soft warning path and health checks around risky Java setups).
- Stability fixes for recurring background tasks and panel refresh behavior.

### Security
- Telemetry connection-string based path removed from project flow; no active telemetry secret path in extension settings by default.

### Testing
- Node/unit smoke coverage expanded for:
- command budgets,
- perf budgets,
- run-flow ordering,
- webview snapshots,
- slow-path metrics.
