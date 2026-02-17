# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning: SemVer.

## [Unreleased]
### Added
- Real-project reliability runner:
- `scripts/run-real-project-checks.js`
- `qa/real-projects/projects.sample.json`
- `qa/real-projects/README.md`
- Top-10 failure triage playbook:
- `docs/TOP_10_CRASH_FIXES.md`
- GitHub bug template for manual feedback loop:
- `.github/ISSUE_TEMPLATE/bug_report.yml`
- New scenario GIF assets for Marketplace/README demos:
- `assets/gifs/scenario-run-debug-cycle.gif`
- `assets/gifs/scenario-device-launch.gif`
- `assets/gifs/scenario-xml-live-edit.gif`

### Changed
- CI hardening:
- added VSIX package dry-run artifact build in `.github/workflows/ci.yml`
- Release scripts:
- `release:publish:dry-run` and real-project QA command in `package.json`
- UX micro-polish:
- reduced repeated status notifications and tightened message throttling in `src/ui/notifications.ts`
- Documentation updates in `README.md` for:
- Quick Start,
- Troubleshooting,
- Known Limitations,
- reliability workflow and manual feedback process.

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
