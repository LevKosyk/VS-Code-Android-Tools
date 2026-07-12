# Privacy

Android Tools runs locally in the VS Code extension host. The extension does not send source code, Android project metadata, device identifiers, logs, diagnostics, or usage events to the publisher or to an AI service.

Commands that open an external page, such as Marketplace, GitHub, or documentation links, only run after an explicit user action. Normal build, install, device, emulator, Logcat, and diagnostics operations invoke local Android SDK, Java, Gradle, Git, or operating-system tools.

Some features store local workspace or user preferences through VS Code storage, including selected devices, launch profiles, filters, and recent run history. Project-shared configuration is only written when the user explicitly invokes an export or configuration command.

Exported diagnostics can contain local paths, package names, device metadata, command output, and Logcat excerpts. Review an exported bundle before sharing it publicly.

If a future release adds remote services or optional telemetry, it must be opt-in and this document must describe the data, destination, retention, and deletion controls before that feature is enabled.
