# Release 0.2.7



### Fixed
- CI perf gate: accept zero `firstCommandLatencyMs` in CI snapshot (prevents false failures when first-command latency is reported as 0)
- Normalize OS detection for `darwin` → `macos` to avoid incorrect `windows` mapping

