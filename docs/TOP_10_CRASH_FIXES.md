# Top 10 Failure Buckets and Fix Paths

This file is used for manual triage without telemetry.

## Buckets
1. `sdkMissing`
- Why: SDK path is missing or invalid.
- Auto-fix: `Android: Gradle Doctor`
- Manual fix: set `ANDROID_SDK_ROOT` or `sdk.dir`.

2. `buildToolsVersion`
- Why: required build-tools are missing/mismatched.
- Auto-fix: `Android: Gradle Doctor` + `Android: Use JDK 21 Path`.
- Manual fix: install required Build Tools version.

3. `jdkMismatch`
- Why: unsupported JDK for project/tooling.
- Auto-fix: `Android: Use JDK 21 Path`.
- Manual fix: align Gradle + Java toolchain.

4. `kotlinRuntime`
- Why: Kotlin LS/compiler runtime mismatch.
- Auto-fix: `Android: Use JDK 21 Path`, restart VS Code.
- Manual fix: verify `JAVA_HOME`, Kotlin extension runtime.

5. `dependencyResolution`
- Why: repository/offline/conflict issues.
- Auto-fix: `Android: Gradle Sync` + `Android: Open Gradle Intelligence`.
- Manual fix: repositories/versions/offline mode.

6. `taskNotFound`
- Why: invalid module/variant/task mapping.
- Auto-fix: `Android: Select Build Variant`.
- Manual fix: verify Gradle tasks for module.

7. `daemonIssue`
- Why: Gradle daemon crash/start failure.
- Auto-fix: `Android: Gradle Doctor`, then clean/retry.
- Manual fix: tune Gradle daemon/JVM settings.

8. `manifestMerge`
- Why: manifest conflicts.
- Auto-fix: open diagnostics from Run failure context.
- Manual fix: resolve `tools:replace`/duplicate nodes.

9. `signingConfig`
- Why: invalid keystore/signing params.
- Auto-fix: `Android: Open Signing Wizard`.
- Manual fix: verify keystore path, alias, passwords.

10. `namespaceMissing`
- Why: missing `android.namespace`.
- Auto-fix: Gradle sync after auto/quick edit.
- Manual fix: add namespace in module Gradle config.

## Update Process
1. Run real-project report (`qa/real-projects`).
2. Update count/status per bucket.
3. Prioritize fix by frequency and impact.
