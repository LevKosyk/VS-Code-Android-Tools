# Release 1.0.1

### Added
- Unified Device Center entry point with device input, clipboard, app-data, wireless, and mirroring workflows.
- Wireless debugging commands for validated `adb pair`, `adb connect`, and `adb disconnect` endpoints, including IPv4, hostname, and bracketed IPv6 support.
- Optional scrcpy discovery and per-device mirroring with configurable executable path.
- Explicit Run Pipeline state machine with ordered, terminal, failure, and cancellation states.
- Gradle Model Helper combining application modules, application IDs, build types, product flavors, and variants.
- AGP `output-metadata.json` APK resolution with preference for universal artifacts over ABI splits.
- Ordered ADB offline recovery: server restart, device reconnect, and online wait.
- Integration coverage for wireless endpoints, offline recovery, flavored multi-module models, APK metadata, and pipeline state transitions.

### Changed
- Strengthened JDWP process discovery by removing shell pipelines, filtering invalid PIDs, parsing null-delimited process names, and bounding port discovery.
- Expanded the focused Command Palette to 41 commands to expose Device Center, wireless debugging, scrcpy, and clear-app-data workflows.
- Continued lifecycle-aware app PID tracking and crash navigation in Logcat 2.0.

### Fixed
- Physical-device actions no longer depend on a running emulator.
- APK selection no longer relies only on recursive modification time when AGP metadata is available.
- ADB recovery now fails explicitly at the owning server, reconnect, or wait stage.
