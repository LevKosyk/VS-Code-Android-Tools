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
- Drag and drop to move files and folders between directories
- Conflict-safe moves (auto-renames when target name already exists)
- Move preview before drop with confirm/cancel

Emulator Control
- Rotation, screenshots
- Cold boot, warm boot, wipe data
- Network on and off
- Battery simulation with level and charging
- Screen recording
- Quick actions: key events, taps, swipes, text input
- Push/pull clipboard

Logcat Viewer
- Live stream, filter by tag, level, or search
- Clear logs
- Save filter presets

Debugging
- Attach and detach
- Breakpoints via VS Code debugger

Profiler (Lite)
- CPU and memory snapshots
- ADB performance monitor: CPU, memory, graphics polling
- Record 10s performance series to JSON trace

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

Gradle Build Output Panel
- Dedicated Gradle output channel
- Error parsing with file/line links

Build Variants
- Pick debug, release, and product flavors

Launch Profiles
- Save module, variant, device type, and optional task
- Run profiles from the command palette

Run Configurations
- Per module and variant configs
- Pre-run tasks, env vars, and Gradle arguments

APK Analyzer (Lite)
- Total APK size
- Top largest files

APK Analyzer (Lite+)
- Compare two APKs
- Top classes and resources

Mapping Viewer
- Open mapping.txt
- Search classes
- Deobfuscate stacktraces

App Inspection (Lite)
- Running processes
- Package version and install info
- Live network log stream (OkHttp/HTTP via Logcat pattern)
- Kill + Restart + Clear Data quick action

Database Inspector (Lite)
- List app databases
- Pull database files for local inspection
 - Simple queries and CSV export
- Snapshot and diff between database states

APK Install Matrix
- Install the same APK on multiple devices
- Per-device report output

Device File Explorer
- Browse `/sdcard`
- Pull and push files

ADB Shell
- Open an interactive shell per device

Layout Preview (Lite)
- Static preview for layout XML
- Layout Editor (Lite): drag-and-drop components, properties, constraint handles, snap-to-grid, alignment guides
- Multi-select with Cmd/Ctrl-click, align/distribute actions, and delete selected
- Undo/Redo support for layout edits
- Expanded palette: TextView, Button, EditText, ImageView, CheckBox, Switch, ProgressBar
- Constraint type selectors: `toStartOf` / `toEndOf` / `toTopOf` / `toBottomOf`
- Component Tree panel for quick selection and multi-select
- Properties grouped by categories: common, text, layout, visibility
- Visual constraint arrows with different styles for each link type
- Resize handles on selected component (corner resize)
- Constraint diagnostics panel: missing constraints, overlap, off-screen + badges in Component Tree
- Diagnostics auto-fix actions: per-issue `Fix`, `Focus`, and global `Auto-Fix All`
- Safe Auto-Fix mode: preview fixes before apply, with `Apply Preview` / `Discard Preview`
- Safe Auto-Fix diff preview: per-component before/after field changes before apply
- Diagnostics undo: `Undo Last Fix` restores previous layout state for diagnostics actions
- UX polish: disabled button states, cleaner empty/loading states, and reduced noisy notifications
- Live write modes: `onType` (debounced auto-write) or `onSave` (manual Apply XML)
- Live device preview loop (optional) with gfx hotspot hints

Layout Inspector (Lite)
- View tree with bounds
- Screenshot overlay
- Live filter by id/class/text

Compose Tooling (Lite)
- Static compose preview list from `@Preview`
- Live preview via emulator screenshot
- Parameter set input and recomposition hotspot hints (gfx framestats)

Test Runner
- Unit and instrumentation launch from panel
- Tree view from JUnit XML reports
- Re-run failed tests quickly
- Device matrix run for instrumentation

Gradle Doctor
- Auto-fix helpers for SDK components and daemon JVM args
- Offline mode toggle
- Cache cleaner for common Gradle cache groups
- Auto-detect sdkmanager from Android cmdline-tools

Signing and Release
- Play App Signing helper
- Bundletool integration (`build-apks`, `install-apks`)
- VersionCode bump wizard
- Auto-detect `bundletool.jar` from project/home common locations

Manifest and Resource Tools
- Insert templates
- Basic validation
- Resource inspector (values)
 - Go to resource by R.string/R.color/R.dimen
 - Manifest editor for activity/service/permission
- Navigation graph helpers (destination/argument jump + SVG preview)
- Graph layout with action arrows in SVG preview

New Project Wizard
- App name, package, language
- Activity, manifest, resources
- Gradle files and wrapper when available

## Commands
| Command | Description |
| --- | --- |
| Android: List Devices | Show connected devices |
| Refresh | Refresh current Android Tools view |
| Open in Explorer | Reveal selected item in VS Code explorer |
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
| Android: Rename | Rename selected file/folder in Android project view |
| Android: Delete | Delete selected file/folder in Android project view |
| Android: Create Run Configuration | Create a run configuration |
| Android: Run Run Configuration | Run a saved configuration |
| Android: Delete Run Configuration | Delete a configuration |
| Android: APK Analyzer | Analyze APK size |
| Android: Compare APKs | Compare two APKs |
| Android: App Inspection | Inspect running apps |
| Android: Kill+Restart with Clear Data | Reset and restart selected app |
| Android: Database Inspector | Inspect app databases |
| Android: Debug Panel | Open integrated debug panel |
| Android: Build Cache Inspector | Show build cache stats and issues |
| Android: Dependency Insight | Run Gradle dependency insight |
| Android: Signing Wizard | Generate keystore and setup signing |
| Android: Build Signed APK | Build release APK |
| Android: Build Signed AAB | Build release bundle |
| Android: Refresh Device Explorer | Refresh device files |
| Android: Pull From Device | Download file or folder |
| Android: Push To Device | Upload files to device |
| Android: Delete From Device | Delete device files |
| Android: Open ADB Shell | Open shell terminal |
| Android: Preview Layout | Show layout preview |
| Android: Open Layout Editor (Lite) | Drag-drop layout editor with properties and XML sync |
| Android: Layout Inspector | View bounds and overlay |
| Android: Compose Preview (Lite) | List and open `@Preview` composables |
| Android: Validate Manifest | Basic manifest checks |
| Android: Insert Manifest Template | Insert manifest snippets |
| Android: Add Manifest Entry | Add activity/service/permission |
| Android: Open Manifest Editor | Open manifest editor |
| Android: Validate Resources | Basic res checks |
| Android: Insert Values Template | Insert values snippets |
| Android: Resource Inspector | Search resources |
| Android: Go To Resource (R.) | Jump to values resource |
| Android: Jump To Navigation Destination | Jump to destination in navigation graph |
| Android: Jump To Navigation Argument | Jump to argument in navigation graph |
| Android: Preview Navigation Graph (SVG) | Render navigation graph overview |
| Android: Device Quick Actions | Send keys, taps, swipes, text, clipboard |
| Android: Mapping Viewer (Proguard/R8) | Open mapping.txt and deobfuscate stacktraces |
| Android: Performance Monitor | Live CPU/memory/graphics polling |
| Android: Compose Live Preview | Live screenshot-based preview with params |
| Android: Select Device | Set device for status bar |
| Android: Select Module | Set module for status bar |
| Android: Run (Selected Target) | Run using status bar selection |
| Android: Stop App | Force stop selected app |
| Android: Install APK | Install an APK |
| Android: Install APK on Multiple Devices | Install APK on multiple devices |
| Android: Device Matrix Run | Run app/tests on selected devices |
| Android: Matrix Dashboard | Unified matrix UI with saved device presets |
| Android: Gradle Doctor | Check and auto-fix Gradle environment issues |
| Android: Save Emulator Snapshot | Save current emulator snapshot |
| Android: Load Emulator Snapshot | Load emulator snapshot |
| Android: Gradle Sync | Run Gradle sync task |
| Android: Project Health Check | Check SDK/NDK/build-tools/project setup |
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
| Mobile: Create Device | Create a simulator/device profile |
| Mobile: Refresh Device Manager | Refresh device manager view |
| Launch Device | Launch selected managed device |
| Stop Device | Stop selected managed device |
| Delete Device | Delete selected managed device |
| Android: Open Test Runner | Run tests, view tree, rerun failed, matrix |
| Android: Open Performance Profiler | Open profiler panel |
| Android: Play App Signing Helper | Guide for upload key vs app signing key |
| Android: Bundletool Build APKS | Build `.apks` from `.aab` |
| Android: Bundletool Install APKS | Install `.apks` to device |
| Android: Bump Version Code Wizard | Increment versionCode in Gradle file |

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
- Too many popups: set `androidToolkit.notifications.mode` to `quiet` in VS Code Settings

## Release
- `npm ci`
- `npm run -s compile`
- `npm run -s vscode:prepublish`
- `vsce package`

## License
MIT

## Roadmap
- Emulator and device auto sync stability improvements
- More project templates
- Layout preview improvements
- Better build diagnostics and quick fixes

## Changelog
0.1.5
- App Inspection parity: live network stream and kill+restart+clear-data action
- Database diff snapshots
- Compose live preview via emulator screenshot with hotspot hints
- Test runner panel with tree view, rerun failed, and device matrix
- Navigation graph jump tools and SVG graph layout with action arrows
- Gradle Doctor auto-fixes and cache cleaner
- Signing/release helpers: Play App Signing helper, bundletool build/install, versionCode bump
- Matrix Dashboard with saved device presets
- Telemetry integration and release cleanup (manifest dedupe, removed debug noise)

0.1.4
- Device selector bar (device, module, variant)
- Run panel improvements
- Gradle task explorer
- Gradle build output panel with error parsing
- Run configurations (pre-tasks, env vars, args)
- APK analyzer and compare
- APK install matrix (multi-device install)
- App inspection and database inspector
- Device file explorer and ADB shell
- Layout preview and inspector
- Manifest and resource tools
- Signing wizard and build signed APK/AAB
- Emulator snapshots

0.1.3
- Project health checks
- Launch profiles
- Build variants UI
- Logcat presets and saved sessions

0.1.2
- Debug panel
- Profiler (lite)
- Emulator control improvements

0.1.1
- Run panel (build, install, run, clean)
- Run on device
- Gradle tasks
- Drag and drop in project view
- New project wizard
