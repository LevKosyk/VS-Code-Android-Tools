# Release 0.2.5

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
