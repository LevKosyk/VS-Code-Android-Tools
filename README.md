<div align="center">
  <img src="https://raw.githubusercontent.com/LevKosyk/VS-Code-Android-Tools/main/assets/logo/logo.png" width="120" alt="Android Tools logo" />

  # Android Tools for VS Code

  Build, install, launch, inspect, and debug Android applications without leaving VS Code.

  [![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/levkosyk.vscode-android-tools?label=Marketplace)](https://marketplace.visualstudio.com/items?itemName=levkosyk.vscode-android-tools)
  [![Installs](https://img.shields.io/visual-studio-marketplace/i/levkosyk.vscode-android-tools)](https://marketplace.visualstudio.com/items?itemName=levkosyk.vscode-android-tools)
  [![CI](https://github.com/LevKosyk/VS-Code-Android-Tools/actions/workflows/ci.yml/badge.svg)](https://github.com/LevKosyk/VS-Code-Android-Tools/actions/workflows/ci.yml)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
</div>

Android Tools is a local-first Android control center for VS Code. It focuses on the workflows developers use every day: validate the environment, select a module and device, build and install the application, verify that it is actually running, then inspect Logcat and device state.

It complements Android Studio; it does not attempt to replace the Android SDK, Gradle, emulator, or platform tooling.

![Android Project view](https://raw.githubusercontent.com/LevKosyk/VS-Code-Android-Tools/main/assets/gifs/file-system.gif)

![Run on device](https://raw.githubusercontent.com/LevKosyk/VS-Code-Android-Tools/main/assets/gifs/scenario-run-debug-cycle.gif)

## Version 1.0.1

Version 1.0.1 completes the reliability roadmap:

- focused Command Palette with 41 primary workflows;
- Android-only Device Manager for physical devices and AVDs;
- explicit Run Pipeline with preflight, build, install, launch, and process verification;
- application-aware Logcat with PID refresh after restart;
- crash and ANR highlighting;
- navigation from Kotlin/Java stack frames to source;
- wireless `adb pair/connect/disconnect` workflows;
- optional scrcpy mirroring for the selected device;
- explicit Run Pipeline state machine;
- Gradle Model Helper for multi-module projects and product flavors;
- AGP metadata-based APK selection;
- scoped activation that stays inactive outside Android workspaces;
- Windows, macOS, and Linux CI coverage;
- no recurring rating prompts and no hidden remote telemetry.

## Quick start

1. Install a supported JDK and Android SDK Platform Tools.
2. Open the root directory of an Android Gradle project.
3. Run `Android: First-Run Health Wizard`.
4. Connect a physical device or start an AVD.
5. Run `Android: Open Run Panel`.
6. Select `Module → Variant → Device`, then choose **Run**.
7. Open `Android: Open Logcat Viewer` when you need runtime logs.

The Run Pipeline reports each stage separately. A launch is only successful after Android Tools confirms that the application process exists on the selected device.

## Requirements

Required:

- VS Code 1.85 or newer;
- JDK 17–21;
- Android SDK Platform Tools (`adb`);
- an Android Gradle project for build/run workflows.

Optional:

- Android Emulator package for AVD workflows;
- Android SDK Command-line Tools for AVD creation;
- Android Build Tools for APK inspection and signing;
- `bundletool` for APKS workflows;
- `scrcpy` may be used externally for device mirroring.

Physical-device workflows remain available when the Android Emulator package is not installed.

## Core workflows

### Environment Doctor

The Health Wizard checks:

- Android SDK and ADB availability;
- JDK presence and supported version;
- Android application modules;
- online physical devices and emulators.

Failures are shown explicitly with a suggested next action. Missing SDK or Java installations do not crash the wizard.

### Run Pipeline

The Run Panel owns the primary execution flow:

```text
Preflight → Build/Assemble → Install → Launch → Verify process
```

It supports:

- module and build-variant selection;
- physical devices and emulators;
- cancellation of active operations;
- Gradle and ADB recovery for known transient failures;
- recent runs and launch profiles;
- actionable failure reports;
- APK install-diff information;
- direct access to the last failed stage.

### Device Manager

One Android Device Manager shows:

- connected physical devices;
- online, offline, and unauthorized state;
- installed AVDs;
- AVD launch, stop, snapshot, cold boot, and wipe actions;
- screenshots, recording, rotation, network, battery, and location controls;
- Device File Explorer push, pull, and delete actions.

Destructive emulator-only actions are not offered for physical devices.

### Device Center and wireless debugging

`Android: Open Device Center` brings together connected-device selection and common input/clipboard actions. Additional commands provide:

- secure Wireless debugging pairing with a six-digit code;
- validated IPv4, hostname, and bracketed IPv6 endpoints;
- wireless connect and disconnect;
- optional scrcpy mirroring through `androidToolkit.scrcpy.path`;
- clear application data with device, package, and confirmation selection.

Wireless commands use the Android SDK's own ADB binary and report the exact failing stage.

### Logcat 2.0

Logcat supports:

- live device streaming;
- minimum-level, tag, and text filters;
- saved and pinned presets;
- app-only filtering by live PID;
- automatic PID refresh when the application restarts;
- crash, ANR, and stack-frame classification;
- Kotlin/Java source navigation from stack frames;
- bounded rendering for long sessions;
- selected-line and full-session export.

![Logcat and run workflow](https://raw.githubusercontent.com/LevKosyk/VS-Code-Android-Tools/main/assets/gifs/run-panel.gif)

### APK and release tools

- install an existing APK;
- inspect and compare APK contents;
- build signed APK and AAB artifacts;
- signing and release-flow wizards;
- ProGuard/R8 mapping viewer and crash symbolicator;
- manifest and resource validation.

APK discovery reads AGP `output-metadata.json` when available and prefers an unfiltered universal APK over ABI-specific splits. Recursive output discovery remains available for older Android Gradle Plugin projects.

### Gradle model, flavors, and multi-module projects

The Gradle Model Helper combines application-module discovery with Gradle task information to expose:

- application modules in a multi-module workspace;
- application IDs;
- build types;
- product flavors;
- complete variants such as `DemoDebug` and `ProductionRelease`.

Launch profiles persist module, variant, target type, and an optional pre-launch Gradle task.

### Debug reliability

Android debugging validates online devices, debuggable JDWP processes, local port availability, ADB forwarding, and the JDWP handshake before starting the Java debug adapter. Port forwards are removed on detach or failed connection.

### Android project view

- Android, project-files, and package layouts;
- Kotlin/Java classes, resources, assets, files, and folders;
- rename, move, delete, restore, and undo;
- Gradle task explorer;
- manifest, resource, navigation, and XML utilities.

## Primary commands

| Command | Purpose |
| --- | --- |
| `Android: First-Run Health Wizard` | Validate SDK, JDK, modules, and devices |
| `Android: Open Run Panel` | Build, install, launch, and verify an app |
| `Android: Select Device` | Select a physical device or emulator |
| `Android: Select Build Variant` | Choose debug, release, or product flavor |
| `Android: Open Logcat Viewer` | Stream and filter device logs |
| `Android: Open Emulator Control` | Control the selected emulator |
| `Android: Open Device Center` | Device input, clipboard, app, and connection actions |
| `Android: Pair Wireless Device` | Pair using Android Wireless debugging |
| `Android: Connect Wireless Device` | Connect a previously paired wireless target |
| `Android: Mirror Device with scrcpy` | Mirror the selected device using optional scrcpy |
| `Android: Install APK` | Install an APK on a selected target |
| `Android: APK Analyzer` | Inspect APK contents and metadata |
| `Android: Gradle Sync` | Refresh Gradle project information |
| `Android: Gradle Doctor` | Diagnose common Gradle setup failures |
| `Android: Open Diagnostics Hub` | Open local rules-based diagnostics |
| `Android: Export Diagnostics Bundle` | Export support data for review |

Contextual commands remain available in the Project, Device, Gradle, Problems, and Device Explorer views without flooding the Command Palette.

## Troubleshooting

### Android SDK or ADB is not detected

Set one of the standard SDK variables and restart VS Code:

```bash
export ANDROID_SDK_ROOT="$HOME/Library/Android/sdk" # macOS example
export PATH="$PATH:$ANDROID_SDK_ROOT/platform-tools"
```

On Windows, the usual SDK location is `%LOCALAPPDATA%\Android\Sdk`. Android Tools handles `adb.exe`, `emulator.exe`, and `.bat` command-line tools.

Then run `Android: First-Run Health Wizard` again.

### No device is available

- enable USB debugging on a physical device;
- accept the computer authorization dialog;
- check `adb devices` in a terminal;
- or install the Android Emulator package and run `Android: Start Emulator`.

### Build succeeds but the app is not running

Version 1.0.1 verifies the application PID after launch. If verification fails:

1. open `Android: Open Logcat Viewer`;
2. inspect the highlighted crash or ANR;
3. use the stack-frame source link;
4. open `Android: Open Last Failed Step` or export a diagnostics bundle.

### ADB device is offline

Run the action again after checking the cable or network. Recoverable operations execute an ordered recovery sequence: start the ADB server, reconnect the selected transport, then wait for that exact device to return online. Failures identify the owning recovery stage.

### scrcpy is not found

Install scrcpy separately and ensure it is on `PATH`, or set `androidToolkit.scrcpy.path` to the executable. Android Tools does not download or silently execute an untrusted scrcpy binary.

### Kotlin or Gradle behaves unexpectedly

Run `Android: Gradle Doctor`. Android Tools supports JDK 17–21 and recommends JDK 21 for a consistent modern Android toolchain.

## Privacy and security

Android Tools runs locally. Source code, project metadata, device identifiers, logs, and diagnostics are not sent to the publisher or an AI service.

An exported diagnostics bundle may contain local paths, package names, device information, Gradle output, and Logcat excerpts. Review it before sharing.

See [Privacy](PRIVACY.md) and [Security Policy](SECURITY.md).

## Support

- [Report a bug](https://github.com/LevKosyk/VS-Code-Android-Tools/issues/new?template=bug_report.yml)
- [View existing issues](https://github.com/LevKosyk/VS-Code-Android-Tools/issues)
- [Marketplace page](https://marketplace.visualstudio.com/items?itemName=levkosyk.vscode-android-tools)

Useful bug reports include:

- operating system and architecture;
- VS Code and Android Tools versions;
- JDK and Android SDK paths;
- reproduction steps;
- the first failing Run Pipeline stage;
- a reviewed diagnostics bundle when appropriate.

## Development

```bash
npm ci
npm run compile
npm run lint
npm test
npm run test:p0
npm run test:runtime
npm run release:check
```

The release gate performs clean compilation, linting, unit and smoke tests, P0 workflow checks, runtime Extension Host verification, release metadata validation, and VSIX packaging.

## License

[MIT](LICENSE) © Lev Kosyk
