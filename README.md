# CodeCrafters: Semantic Automation & Context Bridge 🚀

[![Hackathon](https://img.shields.io/badge/Hackathon-Project-blueviolet.svg?style=for-the-badge)](https://github.com/SathishNadar/CodeCrafters-AutomationSystem)
[![Status](https://img.shields.io/badge/Status-Beta-orange.svg?style=for-the-badge)](https://github.com/SathishNadar/CodeCrafters-AutomationSystem)
[![License](https://img.shields.io/badge/License-ISC-blue.svg?style=for-the-badge)](LICENSE)

> **Unlock Deep Focus.** A unified developer productivity ecosystem that bridges VS Code, your browser, and communication channels into a single context-aware dashboard.

![Project Dashboard Header](assets/dashboard-preview.png)

---

## 🌟 The Vision

In a world of constant context-switching, **CodeCrafters** acts as your cognitive assistant. By monitoring signals from your IDE, browser, and communication apps, it builds a real-time "Context Map" of your work. It intelligently suppresses non-urgent notifications during deep work and prioritizes incoming tasks from WhatsApp and Email using advanced AI.

## ✨ Core Features

### 🖥️ Unified Productivity Dashboard (Electron)
The central hub for all signals. Visualize your "Deep Focus Score," track your flow state over time, and manage incoming alerts in a clean, glassmorphic interface.

### 🌉 VS Code Context Bridge
A powerful extension that streams developer activity signals:
- **Typing Bursts & Editor Switches**: Tracks when you're deeply "in the zone."
- **Diagnostics Monitor**: Detects when you're stuck on bugs and adjusts focus rules.
- **Bi-directional Notifications**: Receive important system alerts directly in your status bar.

### 🧭 Focus Pilot (Browser Extension)
Stay focused on research. The extension tracks documentation viewing and cross-references it with your coding context to ensure you're on the right track.

### 💬 Intelligent Communication Nodes
- **WhatsApp Monitor**: Consolidates and classifies messages using AI. No more notification spam—just clear, actionable task summaries.
- **Gmail Notifier**: Automates unread email analysis, prioritizing refactor requests, PR reviews, and urgent client feedback.

---

## 🛠️ Tech Stack

- **Frontend**: Electron, Vanilla JS, HTML5/CSS3 (Glassmorphism)
- **Extensions**: VS Code API, Chrome Extension (Manifest V3)
- **Backend**: Node.js, Express, WebSocket
- **AI/ML**: Google Gemini API, HuggingFace Inference, Qwen
- **Integrations**: WhatsApp-Web.js, Google APIs (OAuth2)

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [VS Code](https://code.visualstudio.com/)
- Gmail API credentials (for Email service)

### 1. The Dashboard (Central Hub)
```bash
cd super-app-dashboard
npm install
npm start
```

### 2. VS Code Context Bridge
1. Open the `ContextBridge` folder in VS Code.
2. Run `npm install`.
3. Press `F5` to open the Extension Development Host.

### 3. Focus Pilot (Web Extension)
1. Navigate to `chrome://extensions`.
2. Enable **Developer Mode**.
3. Click **Load unpacked** and select the `WebExtension` directory.

### 4. Background Services
You can run the monitor services separately or via the dashboard:

**Email Monitor:**
```bash
cd email-notifier-service
npm install
npm start
```

**WhatsApp Monitor:**
```bash
cd whatsapp-monitor-service
npm install
npm start
```

---

## 👥 Contributors

Meet the team behind the magic:

| [<img src="https://github.com/SathishNadar.png?size=100" width="100"><br><sub><b>Sathish Nadar</b></sub>](https://github.com/SathishNadar) | [<img src="https://github.com/janhvidhale04.png?size=100" width="100"><br><sub><b>Janhvi Dhale</b></sub>](https://github.com/janhvidhale04) | [<img src="https://github.com/t-naresh.png?size=100" width="100"><br><sub><b>Naresh T</b></sub>](https://github.com/t-naresh) | [<img src="https://github.com/Vrushabh-003.png?size=100" width="100"><br><sub><b>Vrushabh Shirke</b></sub>](https://github.com/Vrushabh-003) |
| :---: | :---: | :---: | :---: |

---

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

---

<p align="center">Made with ❤️ for Hackathon 101</p>
