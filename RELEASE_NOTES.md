# Release 0.2.4

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
