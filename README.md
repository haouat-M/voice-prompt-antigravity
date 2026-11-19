# Voice Prompt for Antigravity

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey.svg)]()
[![Version](https://img.shields.io/badge/Version-1.4.4-green.svg)]()

Fast, zero-latency hands-free voice dictation extension for **Antigravity IDE**.

Speak your prompts directly into the Antigravity Chat Prompt box with high-accuracy Arabic speech recognition, automatic developer terminology translation (Docker, Git, Laragon, Python, React, Next.js, API, etc.), and a sleek minimalist status bar icon.

---

## ✨ Features

- 🎙️ **Direct Chat Prompt Injection**: Transcribed speech is inserted straight into Antigravity IDE's chat prompt window.
- 🌐 **Automatic Technical Terminology Conversion**: Mentions of developer technologies (even with spoken Arabic prefixes like "بالدوكر" or "والجيت") are instantly converted to proper English keywords (`Docker`, `Git`, `Laragon`, `GitHub`, `Python`, `React`, `API`, etc.).
- 📦 **Automatic Dependency Installation**: The extension checks for required audio libraries (`SpeechRecognition`, `sounddevice`, `numpy`) on first use. If they are not already installed, it **automatically installs them in the background** without any manual setup required!
- 🔴 **Minimalist Status Bar UI**: A clean single icon `$(mic)` in the bottom status bar that changes to `$(record)` in red during recording.
- ⏱️ **Natural Speaking Rhythm**: 2.2-second silence detection allows you to pause naturally while thinking between words.
- ⌨️ **Global Shortcut**: Press `Ctrl+Alt+A` anywhere in the editor to start or stop recording.

---

## 🚀 How to Install

### Step 1: Download & Install VSIX
1. Download the latest release `voice-prompt-antigravity-1.4.4.vsix` from the [Releases page](https://github.com/haouat-M/voice-prompt-antigravity/releases).
2. In Antigravity IDE:
   - Press `Ctrl+Shift+P`
   - Type: `Extensions: Install from VSIX...`
   - Select the downloaded `.vsix` file.
   - Or run in terminal:
     ```bash
     antigravity-ide --install-extension voice-prompt-antigravity-1.4.4.vsix
     ```

### Step 2: Use Immediately (Zero Configuration)
- The extension automatically detects your Python environment and installs the required audio packages (`SpeechRecognition`, `sounddevice`, `numpy`) if they are missing.
- **That's it!** Click the `$(mic)` icon in the bottom right corner or press `Ctrl+Alt+A` to begin dictating.

---

## ⚙️ Extension Settings

Accessible via `Settings -> Extensions -> Voice Prompt for Antigravity`:

| Setting | Default | Description |
|---|---|---|
| `antigravityVoice.language` | `ar-SA` | Spoken voice input language code (`ar-SA`, `ar-EG`, `en-US`, `fr-FR`, etc.) |
| `antigravityVoice.silenceSeconds` | `2.2` | Seconds of silence after which recording automatically finishes |
| `antigravityVoice.target` | `antigravity` | Insertion target (`antigravity` chat prompt or `activeEditor`) |
| `antigravityVoice.autoSend` | `false` | Automatically submits the prompt after speech is transcribed |
| `antigravityVoice.pythonPath` | `""` | Optional custom path to Python executable (auto-detected if blank) |

---

## 🛠️ Commands

- `Voice Prompt: Start / Stop Voice Recording` (`Ctrl+Alt+A`)
- `Voice Prompt: Check & Install Audio Dependencies` (Manually triggers background library verification)
- `Voice Prompt: Select Preferred Input Language`
- `Voice Prompt: Copy Last Transcribed Text`

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
