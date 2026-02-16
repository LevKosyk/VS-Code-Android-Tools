export const ERROR_REASONS = [
  'buildToolsVersion',
  'sdkMissing',
  'dependencyResolution',
  'jdkMismatch',
  'kotlinRuntime',
  'signingConfig',
  'namespaceMissing',
  'manifestMerge',
  'taskNotFound',
  'daemonIssue',
  'unknown',
] as const;

export type ErrorReason = typeof ERROR_REASONS[number];

export interface ErrorReasonMeta {
  id: ErrorReason;
  title: string;
  why: string;
  autoFix: string;
  manualFix: string;
  docsUrl?: string;
}

export const ERROR_REASON_META: Record<ErrorReason, ErrorReasonMeta> = {
  buildToolsVersion: {
    id: 'buildToolsVersion',
    title: 'Build Tools / Java mismatch',
    why: 'Requested Build Tools version is missing or incompatible with Gradle/JDK.',
    autoFix: 'Run Gradle Doctor and Use JDK 21 Path.',
    manualFix: 'Install missing build-tools in SDK Manager and sync Gradle.',
    docsUrl: 'https://developer.android.com/studio/releases/build-tools',
  },
  sdkMissing: {
    id: 'sdkMissing',
    title: 'Android SDK missing',
    why: 'SDK path is not configured or points to missing location.',
    autoFix: 'Run Gradle Doctor.',
    manualFix: 'Set sdk.dir in local.properties or ANDROID_SDK_ROOT.',
    docsUrl: 'https://developer.android.com/tools',
  },
  dependencyResolution: {
    id: 'dependencyResolution',
    title: 'Dependency resolution failed',
    why: 'Dependency graph cannot resolve artifacts (repo/offline/conflict).',
    autoFix: 'Run Gradle Sync or open Gradle Intelligence.',
    manualFix: 'Check repositories, versions, and disable offline mode.',
    docsUrl: 'https://docs.gradle.org/current/userguide/dependency_resolution.html',
  },
  jdkMismatch: {
    id: 'jdkMismatch',
    title: 'JDK mismatch',
    why: 'JDK version is not compatible with Kotlin/Gradle setup.',
    autoFix: 'Use JDK 21 Path.',
    manualFix: 'Configure java.home / Gradle JDK to 17 or 21.',
    docsUrl: 'https://kotlinlang.org/docs/gradle-configure-project.html',
  },
  kotlinRuntime: {
    id: 'kotlinRuntime',
    title: 'Kotlin runtime/tooling failure',
    why: 'Kotlin language server/compiler failed due to runtime mismatch.',
    autoFix: 'Use JDK 21 Path and restart VS Code.',
    manualFix: 'Check JAVA_HOME and Kotlin extension runtime.',
  },
  signingConfig: {
    id: 'signingConfig',
    title: 'Signing configuration invalid',
    why: 'Keystore/signing params are invalid or missing.',
    autoFix: 'Open Signing Wizard.',
    manualFix: 'Validate keystore path, alias, passwords, and gradle signing config.',
  },
  namespaceMissing: {
    id: 'namespaceMissing',
    title: 'Namespace missing',
    why: 'Android namespace is not set in module Gradle config.',
    autoFix: 'Run Gradle Sync after updating module config.',
    manualFix: 'Add android.namespace in module build.gradle/build.gradle.kts.',
  },
  manifestMerge: {
    id: 'manifestMerge',
    title: 'Manifest merge failed',
    why: 'Manifest entries conflict across app/dependencies.',
    autoFix: 'Open merged manifest diagnostics and resolve conflicts.',
    manualFix: 'Adjust attributes/tools:replace and duplicated nodes.',
  },
  taskNotFound: {
    id: 'taskNotFound',
    title: 'Task not found',
    why: 'Selected variant/task does not exist for current module.',
    autoFix: 'Select Build Variant.',
    manualFix: 'Run Gradle tasks and verify module/variant names.',
  },
  daemonIssue: {
    id: 'daemonIssue',
    title: 'Gradle daemon issue',
    why: 'Gradle daemon crashed or cannot be started.',
    autoFix: 'Run Gradle Doctor and clean.',
    manualFix: 'Tune gradle.properties JVM args, stop daemons, retry.',
  },
  unknown: {
    id: 'unknown',
    title: 'Unknown failure',
    why: 'Failure did not match known signatures.',
    autoFix: 'Open Run Failure Report and Gradle output.',
    manualFix: 'Inspect stacktrace and apply module-level fix.',
  },
};

export function normalizeErrorReason(value: string | undefined | null): ErrorReason {
  if (!value) {
    return 'unknown';
  }
  if (value === 'kotlinK2') {
    return 'kotlinRuntime';
  }
  if ((ERROR_REASONS as readonly string[]).includes(value)) {
    return value as ErrorReason;
  }
  return 'unknown';
}
