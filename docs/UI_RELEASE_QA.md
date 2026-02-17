# UI Release QA (Final Pass)

Run this checklist before final release.

## Run Panel
- [ ] Primary row shows `Run / Stop / Install` in one line.
- [ ] Flow works: `Module -> Device -> Variant -> Run`.
- [ ] Inline validation shown for missing module/device/variant.
- [ ] Status chip transitions: `Idle -> Running -> Failed/Fixed`.
- [ ] Error block highlights reason + fix suggestions.

## Project View
- [ ] Java/Kotlin files are visible in structure.
- [ ] Drag-and-drop move works between folders.
- [ ] Rename/delete/create file/folder works.
- [ ] Undo restore path works for move/delete.

## Diagnostics & Insights
- [ ] Startup Profiler opens and shows phases.
- [ ] SLO Dashboard opens and shows metrics.
- [ ] Top slow stages section is rendered.

## Notifications UX
- [ ] Quiet mode: no popup spam.
- [ ] Normal mode: warnings/errors appear, duplicates are throttled.
- [ ] Errors always logged in output channel.

## Accessibility Basics
- [ ] Keyboard navigation reaches main actions.
- [ ] Focus state is visible on primary controls.
- [ ] Color contrast is readable in light/dark themes.
