# Release 0.2.7

### Fixed
- Treat `firstCommandLatencyMs` === 0 as a valid measurement in CI perf snapshot checks to avoid false failures of the perf gate.
- Correct OS normalization for `darwin` so it maps to `macos` (prevents accidental mapping to `windows`).

### Testing
- Verified local run of `node scripts/check-ci-perf-budget.js` with representative snapshot; CI perf gate now accepts zero latency and reports pass when appropriate.
