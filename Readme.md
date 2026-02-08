<div align="center">
  <img src="assets/logo/logo.png" width="120" alt="Android Sidecar Logo" />
</div>

# 🚀 Android Tools for VS Code

> **Run, debug, and control Android apps in VS Code — without Android Studio.**

**Android Sidecar** is a lightweight, open‑source VS Code extension that brings the *most frequently used* Android Studio workflows directly into VS Code.

It is **not** a replacement for Android Studio.  
It is a **sidecar** — focused on speed, simplicity, and daily developer needs.

![File System](assets/gifs/file-system.gif)

![Phone Launch](assets/gifs/phone-launch.gif)

---

## ✨ Why Android Sidecar?

Most Android developers open Android Studio just to:

- start an emulator
- run or reinstall an app
- view Logcat
- do basic debugging

Everything else already happens in VS Code.

**Android Sidecar removes that friction.**

---

## 🚀 Key Features

### ▶️ Fast Android Runner
- Automatic Android SDK & ADB detection
- List available Android Virtual Devices (AVDs)
- Start / stop emulators
- Install APKs or debug builds
- Reinstall & run app quickly
- Device discovery via `adb devices`
- Clear run & device status indicators

---

### 📁 Android Project View
Android‑Studio‑inspired logical project structure:

- **Manifests**
- **Java / Kotlin** (package‑aware)
- **Res**
- **Assets**
- **Gradle Scripts**

> Visual organization only — your real file system remains unchanged.

---

### 🎛 Emulator Control
Control Android emulators directly from VS Code:

- Screen rotation
- Screenshot capture
- Cold / warm boot
- Wipe data
- Network on / off
- Battery simulation *(level & charging)*
- GPS location mocking *(planned)*

---

### 📜 Logcat Viewer
Minimal, fast Logcat experience:

- Live Logcat stream
- Filter by package, tag, or log level
- Clear logs instantly
- Device‑aware log streams

---

## 🧪 Debugging (Minimal)
> Focused on everyday debugging — not full Android Studio replacement.

- Breakpoints
- Stack traces
- Variable inspection
- Attach / detach debugger

---

## 🧭 Roadmap

### Phase 1 — Core (MVP)
- Fast Android Runner
- Android Project View
- Emulator Control (basic)
- Logcat Viewer

### Phase 2 — Debug & DX
- Minimal Android Debugger
- Project Setup Assistant
- Emulator auto‑sync & stability improvements

### Phase 3 — Advanced (Optional)
- Advanced emulator controls
- Performance snapshots (CPU, memory)
- App startup timing

> ⚠️ Advanced profiling is intentionally postponed due to complexity.

---

## ❌ Out of Scope

Android Sidecar **will not** include:

- Layout Editor
- UI Designer
- Full Android Studio replacement
- Custom Gradle build systems

> Philosophy: *Stay fast. Stay focused.*

---

## 🛠 How It Works

- Built on the VS Code Extension API
- Powered by existing Android CLI tools:
  - `adb`
  - `emulator`
  - `avdmanager`
- No background daemons
- No hidden magic

---

## 📦 Requirements

- Android SDK
- ADB
- Android Emulator
- VS Code (latest stable)

> Android Studio is **not required**.

---

## 🤝 Contributing

Android Sidecar is open‑source and community‑driven.

- Feature ideas
- Bug reports
- Pull requests

are all welcome ❤️

---

## 📜 License

MIT

---

> **Android Sidecar for VS Code**  
> Android development — without fighting your IDE.