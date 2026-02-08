# 🚀 Android Tools for VS Code

> **Fast, lightweight Android workflow in VS Code — without Android Studio.**

Android Tools for VS Code is an open‑source extension that brings the **most used parts of Android Studio** into VS Code, without the heavy IDE, long startup times, and unnecessary complexity.

The goal is **not** to replace Android Studio.
The goal is to cover **80% of daily Android needs with 20% of the complexity**.

---

## ✨ Motivation

Many developers use Android Studio only for:

* running the emulator
* launching the app
* checking logs
* basic debugging

Everything else happens in VS Code.

This extension exists to remove that friction.

---

## 🎯 Mission

> Provide a fast, minimal, and developer‑first Android experience inside VS Code, powered by existing Android CLI tools.

---

## 🧩 Core Principles

* ⚡ **Fast over feature‑rich**
* 🧠 **Developer experience first**
* 🧩 **Modular architecture**
* 🚫 **No magic — only CLI orchestration**
* 🔍 **Clear errors instead of cryptic logs**

---

## ✅ Current Roadmap

### Phase 1 — Core (MVP)

*Immediate value, minimal scope*

#### 1️⃣ Fast Android Runner

* 📱 Automatic Android SDK detection
* 📋 List of available AVDs
* ▶️ Start / stop emulator
* 🔄 Reinstall & run app
* 📦 Install APK / debug build
* 📡 Device discovery (`adb devices`)
* 🟢 Emulator & app run status

> Most developers open Android Studio just to press **Run** — this removes that need.

---

#### 2️⃣ Android Project View

Custom project structure panel inspired by Android Studio:

* 📁 Manifests
* 📁 Java / Kotlin
* 📁 Res
* 📁 Gradle Scripts

> Visual organization only — the real file system is untouched.

---

#### 3️⃣ Emulator Control (Basic)

Essential emulator controls directly from VS Code:

* 🔄 Screen rotation
* 📸 Screenshot capture
* 🔌 Cold / warm boot
* 🧹 Wipe data
* 📶 Network on / off

---

#### 4️⃣ Logcat Viewer (Minimal)

* 📜 Live logcat stream
* 🔍 Filter by package, tag, level
* 🧹 Clear logs

---

## 🔜 Short‑Term Roadmap

### Phase 2 — Debug & DX

*Replace everyday Android Studio workflows*

#### 5️⃣ Android Debug (Minimal)

* 🧷 Breakpoints
* 🧠 Stack trace
* 🔎 Variable inspection
* 🔌 Attach / detach debugger

> Not a full Android Studio debugger — just what’s needed for daily development.

---

#### 6️⃣ Project Setup Assistant

* ✅ Verify Android SDK / ADB / Emulator
* 📦 Help install missing components
* ❌ Human‑readable error explanations

> Goal: *Android development without Android Studio pain.*

---

## 🧭 Long‑Term Roadmap

### Phase 3 — Advanced (Optional)

#### 7️⃣ Advanced Emulator Controls

* 📍 GPS mocking
* 🔋 Battery simulation
* 📡 Network speed simulation
* 🌙 Dark / light mode toggle

---

#### 8️⃣ Performance & Profiling *(Future)*

* 📊 CPU & memory snapshots
* 🧠 Frame drop overview
* ⏱️ App startup time

> ⚠️ Intentionally postponed — high complexity and maintenance cost.

---

## ❌ Explicitly Out of Scope

The extension **will not** include:

* ❌ Layout Editor
* ❌ UI Designer
* ❌ Full Android Studio replacement
* ❌ Gradle build system re‑implementation

> Philosophy: *Stay fast, stay focused.*

---

## 🛠️ Technology

* VS Code Extension API
* TypeScript
* Android CLI tools (`adb`, `emulator`, `gradle`)
* No custom build systems
* No background services

---

## 🤝 Contributing

This project is open‑source and community‑driven.

Ideas, issues, and pull requests are welcome.

---

## 📜 License

MIT

---

> **Android Tools for VS Code**
> Build Android apps without fighting your IDE.
