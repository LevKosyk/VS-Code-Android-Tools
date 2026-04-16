# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning: SemVer.

## [Unreleased]

## [0.2.5] - 2026-04-16
### Added
- AI Intelligence Hub command and consolidated report workflow: `Android: Open AI Intelligence Hub`.
- AI Crash Triage Hub capabilities:
- auto-cluster crash patterns by likely root cause (missing mapping/proguard, NPE, resource issues, ABI/native mismatch),
- confidence scoring per cluster,
- one-click suggested fix actions with probable file/config hints.
- Smart Device Test Matrix recommendations from project state:
- minSdk/targetSdk/ABI/features-aware device recommendations,
- flaky hotspot analysis,
- smart smoke run with retry heuristics,
- PR-ready heatmap export.
- Release Risk Score flow before release:
- score from ANR trend, startup regression, mapping drift, permission changes, and test flakiness,
- block/allow gate behavior,
- auditable release override command.
- Startup Performance Guard attribution in Intelligence Hub:
- p95 startup regression attribution to likely stage/fingerprint,
- suggested init deferral plan.
- Policy-as-Code support in Intelligence Hub:
- local rules discovery via `.android-tools/policy.rules.json|yaml|yml`,
- drift detection for manifest/gradle/signing constraints,
- safe auto-fix command for supported rule types.
- Deep Link Fuzz + Contract Validator pass:
- generated deep-link cases from nav graph + manifest,
- replay command for failing/fuzzed deep links on selected device.
- APK Diff Intelligence heuristics:
- explain size delta drivers (dex/native/resources),
- duplication hints and practical shrink/removal guidance.
- Team Playbooks:
- saved incident playbook execution flow (`Crash spike`, `Release blocker`, `Device-only bug`) with concise summary output.
- PR Quality Assistant:
- changed-file-aware focused checks and grouped recommendations.
- Observability Bridge:
- local snapshot correlation from `.android-tools/observability/*.json` with build fingerprint + crash window context.
- New commands:
- `android-toolkit.openIntelligenceHub`
- `android-toolkit.runIntelligenceMatrixSmoke`
- `android-toolkit.exportIntelligencePrHeatmap`
- `android-toolkit.approveReleaseRiskOverride`
- `android-toolkit.enforcePolicyAsCode`
- `android-toolkit.replayDeepLinkFuzzCase`
- `android-toolkit.runTeamPlaybook`
- `android-toolkit.runFocusedPrChecks`

### Changed
- Extension command layer now persists Intelligence Hub snapshot, release-override approvals, and last matrix heatmap result for iterative workflows.
- Documentation and command surface aligned to 0.2.5 Intelligence Hub workflow.

### Testing
- Verified locally: `npm run -s compile`.
- Verified locally: `node --test test/commands-smoke.test.js`.

### Added
- Resource Refactor Tools with bulk rename/move and project-wide reference updates.
- Device Farm Presets with built-in (`QA`, `Release`, `Smoke`) and custom matrix runs.
- API Compatibility Scanner (`minSdk/targetSdk` checks + guided findings report).
- Project Blueprint Templates (`MVVM`, `Clean`, `Multi-module` scaffold generation).
- New diagnostics/recovery commands: `Android: Open Last Failed Step`, `Android: Export Diagnostics Bundle`.

### Changed
- Actionable errors now include clearer root-cause text and context-aware suggestions.
- Added `Copy Fix Command` flow in error prompts and run fix actions.
- Run Panel now includes `Open Last Failed` and `Copy Error Context` in the error/recovery flow.
- Diagnostics bundle now includes Gradle output, Logcat snapshot, device info, diagnostics markdown, run failure report, action replay, and session timeline.
- Quiet mode now suppresses low-signal success/info toast noise while preserving output logs.
- README command table and troubleshooting map updated for new flows and recovery paths.

### Testing
- Updated smoke/runtime command coverage for project blueprints, resource refactor tools, API scanner, device farm presets, last-failed-step, and diagnostics bundle.
- Verified locally: `npm run -s compile`, `npm run -s lint`, `npm test --silent`, `npm run -s test:runtime`.

## [0.2.3] - 2026-02-17
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

## [0.2.2] - 2026-02-16
### Added
- Error taxonomy and better Gradle error handling.
- Test runner improvements (`run-node-tests.js`) and updated `test` command.

### Commits
- `f9a9750` feat: add error taxonomy and handling for Gradle issues
- `e0a659e` feat(tests): add run-node-tests.js for dynamic test discovery and update test command

## [0.2.1] - 2026-02-13
### Fixed
- CI lockfile/package sync for `npm ci`.

### Commits
- `de6c3ea` fix(ci): sync lockfile with package.json for npm ci

## [0.2.0] - 2026-02-13
### Added
- Android Problems Provider and diagnostics workflow.

### Commits
- `d778ae0` feat: Implement Android Problems Provider and Diagnostics

## [0.1.6] - 2026-02-12
### Changed
- Codebase refactor for readability and maintainability.

### Commits
- `20a22f2` Refactor code structure for improved readability and maintainability

## [0.1.5] - 2026-02-12
### Added
- ADB performance monitor panel.

### Commits
- `a6361ad` feat: add performance monitor panel for ADB performance metrics

## [0.1.4] - 2026-02-11
### Fixed
- Android Build Tools install flow.

### Commits
- `3470024` Fix Android build-tools install

## [0.1.2] - 2026-02-11
### Added
- Device manager and resource/code-structure tooling.
- Java/Kotlin package view and language support checks.
- Emulator state service and service/API cleanup.
- README/product presentation updates.

### Changed
- Internal cleanup and performance improvements.

### Commits
- `f193880` fix
- `e021804` last
- `89b5396` license
- `dc53d8f` enchansed performance
- `5873de7` chore: Update logo.
- `ba4d801` feat: Rework README to introduce "Android Sidecar" with updated content and new visual assets.
- `fb0ccd0` refactor: Remove redundant JSDoc comments, simplify type definitions, and introduce emulator state service.
- `39b6e50` feat: Implement hierarchical package view for Java/Kotlin, add language support checks, and introduce new ADB, emulator, and profiler services with their respective UI panels.
- `42ee88f` feat: Implement Android resource creation, code structure analysis, iOS simulator management, and general device management.

## [0.1.0] - 2026-02-06
### Added
- Initial Logcat stream manager and types.

### Commits
- `0c01bd2` feat: Implement Logcat Stream Manager and Types
