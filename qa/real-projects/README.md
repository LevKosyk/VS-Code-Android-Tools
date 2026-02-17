# Real Project Reliability

Use this flow to validate Android Tools on real Android projects and close top crash buckets.

## Goal
- Run against 10-15 real projects (Kotlin/Java, flavors, multi-module).
- Capture top failure buckets from real runs.
- Close top-10 recurring failures.

## Setup
1. Copy `qa/real-projects/projects.sample.json` to `qa/real-projects/projects.local.json`.
2. Fill absolute project paths.
3. Ensure each project builds with Gradle wrapper.

## Run
```bash
npm run -s qa:real-projects -- qa/real-projects/projects.local.json
```

## Output
- JSON report: `.artifacts/real-project-report.json`
- Markdown summary: `.artifacts/real-project-report.md`

## Triage Loop
1. Sort failures by bucket and count.
2. Fix highest-frequency bucket in extension.
3. Re-run same project set.
4. Repeat until top-10 buckets are reduced/closed.

## Definition of Done
- 10+ projects executed.
- Top-10 failure buckets have fix path (auto-fix/manual-fix/docs).
- Failure rate trend improves across two consecutive runs.
