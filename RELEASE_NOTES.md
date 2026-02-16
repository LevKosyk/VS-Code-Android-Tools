# Release 0.2.2

### Added
- Onboarding v2 panel with health score and progress bar.
- Template Gallery panel with previews and capabilities.
- Run/Debug Profiles v2 panel with inline profile editing.
- Gradle diagnostics classifier v2 and run failure report.
- Android Problems view with one-click fixes and source navigation.
- Matrix install retry logic for recoverable ADB failures.
- SEO improvements for VS Code Marketplace metadata.
- Crash/Failure Insights panel with weekly top errors and auto-fix hit rate.
- Team project config export/import via `.vscode/android-tools.json`.
- Gradle Intelligence panel (dependency conflict detector + build scan-lite slow tasks).
- Matrix Dashboard Device Lab upgrades: smoke mode and flaky test history.
- Stability SLO dashboard (run success rate, median build/install, crash-free sessions).
- Error Knowledge Base panel with root-cause playbooks and project file shortcuts.
- Performance pass: lazy panel loading, debounced auto-sync, cached Gradle read scans.
- Release Quality Gate command (`Android: Run Release Quality Gate`) with one-command prepublish checks.
- Run Panel quick action and main action button for Release Gate.

### Changed
- Run panel UX improvements (history search/filter, pinned presets, keyboard shortcuts).
- XML tooling improvements (lint on save, quick fixes, batch extraction).
- GIF assets refreshed and optimized for Marketplace/README load speed.
- First-run health flow is now success-driven (`seen/success` state) with stronger fix-first guidance.
- Unified actionable error UX with clearer reason/why/suggested-fix formatting.

### Fixed
- CI lockfile sync issues (`npm ci` compatibility).
- Node test glob resolution issue by adding dedicated test runner script.
