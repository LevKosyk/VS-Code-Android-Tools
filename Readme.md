<div align="center">
  <img src="https://raw.githubusercontent.com/LevKosyk/Android-Tools/main/assets/logo/logo.png" width="120" alt="Android Sidecar Logo" />
</div>

# Android Tools for VS Code

Run, debug, and control Android apps in VS Code without Android Studio.

Android Sidecar is a lightweight VS Code extension that brings the most used Android Studio workflows into VS Code. It is not a replacement for Android Studio.

![File System](https://raw.githubusercontent.com/LevKosyk/Android-Tools/main/assets/gifs/file-system.gif)

![Phone Launch](https://raw.githubusercontent.com/LevKosyk/Android-Tools/main/assets/gifs/phone-launch.gif)

## Quick Start
1. Install Android SDK and Emulator tools.
2. Run `Android: Start Emulator`.
3. Run `Android: Run App on Emulator`.

## Screenshots
Project View, Emulator Control, Logcat Viewer:
![File System](https://raw.githubusercontent.com/LevKosyk/Android-Tools/main/assets/gifs/file-system.gif)
![Phone Launch](https://raw.githubusercontent.com/LevKosyk/Android-Tools/main/assets/gifs/phone-launch.gif)

## Key Features
Fast Android Runner
- Automatic Android SDK and ADB detection
- Start and stop emulators
- Install APKs or debug builds
- Run app on a selected emulator or device
- Device discovery via `adb devices`

Android Project View
- Manifests, Java and Kotlin, Res, Assets, Gradle
- Create Kotlin or Java class
- Create files and folders
- Rename and delete items
- Drag and drop to move files

Emulator Control
- Rotation, screenshots
- Cold boot, warm boot, wipe data
- Network on and off
- Battery simulation with level and charging
- Screen recording

Logcat Viewer
- Live stream, filter by tag, level, or search
- Clear logs
- Save filter presets

Debugging
- Attach and detach
- Breakpoints via VS Code debugger

Profiler (Lite)
- CPU and memory snapshots

Run Panel
- Select module, device, and build variant
- Build, install, run, clean

Device Selector Bar
- Persistent status bar controls for device, module, and variant
- Run, Debug, Stop buttons

Gradle Sync + Project Health
- Gradle sync command with output channel
- SDK/Build Tools/NDK checks

Gradle Task Explorer
- Browse tasks by group
- One click run

Build Variants
- Pick debug, release, and product flavors

Launch Profiles
- Save module, variant, device type, and optional task
- Run profiles from the command palette

APK Analyzer (Lite)
- Total APK size
- Top largest files

APK Analyzer (Lite+)
- Compare two APKs
- Top classes and resources

App Inspection (Lite)
- Running processes
- Package version and install info

Database Inspector (Lite)
- List app databases
- Pull database files for local inspection
 - Simple queries and CSV export

Device File Explorer
- Browse `/sdcard`
- Pull and push files

ADB Shell
- Open an interactive shell per device

Layout Preview (Lite)
- Static preview for layout XML

Layout Inspector (Lite)
- View tree with bounds
- Screenshot overlay

Manifest and Resource Tools
- Insert templates
- Basic validation
- Resource inspector (values)
 - Go to resource by R.string/R.color/R.dimen
 - Manifest editor for activity/service/permission

New Project Wizard
- App name, package, language
- Activity, manifest, resources
- Gradle files and wrapper when available

## Commands
| Command | Description |
| --- | --- |
| Android: List Devices | Show connected devices |
| Android: Start Emulator | Start an AVD |
| Android: Stop Emulator | Stop an AVD |
| Android: Create Emulator | Create a new AVD |
| Android: Run App on Emulator | Build, install, run on emulator |
| Android: Run App on Device | Build, install, run on device |
| Android: Open Run Panel | Build, install, run, clean in one panel |
| Android: Select Build Variant | Choose debug/release/flavor |
| Android: Gradle Assemble Debug | Assemble debug variant |
| Android: Gradle Install Debug | Install debug via Gradle |
| Android: Gradle Clean | Clean project |
| Android: Run Gradle Task | Run a Gradle task |
| Android: Refresh Gradle Tasks | Refresh task list |
| Android: Create Launch Profile | Save a launch profile |
| Android: Run Launch Profile | Run a launch profile |
| Android: Delete Launch Profile | Delete a launch profile |
| Android: APK Analyzer | Analyze APK size |
| Android: Compare APKs | Compare two APKs |
| Android: App Inspection | Inspect running apps |
| Android: Database Inspector | Inspect app databases |
| Android: Signing Wizard | Generate keystore and setup signing |
| Android: Build Signed APK | Build release APK |
| Android: Build Signed AAB | Build release bundle |
| Android: Refresh Device Explorer | Refresh device files |
| Android: Pull From Device | Download file or folder |
| Android: Push To Device | Upload files to device |
| Android: Delete From Device | Delete device files |
| Android: Open ADB Shell | Open shell terminal |
| Android: Preview Layout | Show layout preview |
| Android: Layout Inspector | View bounds and overlay |
| Android: Validate Manifest | Basic manifest checks |
| Android: Insert Manifest Template | Insert manifest snippets |
| Android: Add Manifest Entry | Add activity/service/permission |
| Android: Open Manifest Editor | Open manifest editor |
| Android: Validate Resources | Basic res checks |
| Android: Insert Values Template | Insert values snippets |
| Android: Resource Inspector | Search resources |
| Android: Go To Resource (R.) | Jump to values resource |
| Android: Select Device | Set device for status bar |
| Android: Select Module | Set module for status bar |
| Android: Run (Selected Target) | Run using status bar selection |
| Android: Stop App | Force stop selected app |
| Android: Install APK | Install an APK |
| Android: Uninstall App | Uninstall package |
| Android: Restart App | Force stop and launch |
| Android: Open Logcat Viewer | Open Logcat panel |
| Android: Clear Logcat | Clear Logcat |
| Android: Open Emulator Control | Open emulator control panel |
| Android: Rotate Screen | Rotate emulator |
| Android: Take Screenshot | Capture screenshot |
| Android: Cold Boot | Cold boot AVD |
| Android: Warm Boot | Warm boot AVD |
| Android: Wipe Data | Factory reset AVD |
| Android: Toggle Network | Toggle emulator network |
| Android: Set Location | Set emulator location |
| Android: Start Screen Recording | Start recording |
| Android: Stop Screen Recording | Stop recording |
| Android: Set Battery Level | Set battery level and state |
| Android: Attach Debugger | Attach Java debugger |
| Android: Detach Debugger | Detach debugger |
| Android: Toggle Breakpoint | Toggle breakpoint |
| Android: Debug Status | Show debug status |
| Android: Create Resource | Create resource file |
| Android: Create Class | Create Kotlin or Java class |
| Android: Create File | Create file |
| Android: Create Folder | Create folder |
| Android: Create Asset | Create asset file |
| Android: Create Language/Locale | Create locale resources |
| Android: New Project | Create new Android project |

## Requirements
- Android SDK
- ADB
- Android Emulator
- VS Code (latest stable)
- JDK 17+ (JDK 21 recommended for Kotlin language server)

Optional:
- Debugger for Java extension for debugging
- Kotlin Language extension for Kotlin support
  - If Kotlin server crashes, use JDK 21 and set `JAVA_HOME`

## Troubleshooting
SDK not found:
- Set `ANDROID_SDK_ROOT` or install SDK via Android command line tools

Kotlin language server crashes:
- Install JDK 21 and set `JAVA_HOME`, then restart VS Code

No devices detected:
- Run `adb devices` in a terminal and check USB authorization

## Roadmap
- Device and emulator auto sync
- More project templates
- Performance snapshots

## Changelog
0.1.1
- Run panel with build, install, run, clean
- Run on device
- Gradle tasks
- Drag and drop in project view
- New project wizard

## License
MIT
