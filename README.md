# SoundDeck Studio

All-in-one dark-mode music workspace for artists, content creators, and DJs featuring AI lyrics & voice alignment, beat pads, multi-track DAW with Audacity bridge, Virtual DJ console, Social Hub, Global Discover, Offline Library, Wireless Device Installer, and BuymeSoda creator support.

## Key Capabilities

- **Music Creation & Beat Pads**: 16 hardware-style beat pads with Web Audio synthesis, custom sample chops, AI lyrics generation, and cadence-matched vocal alignment.
- **Multi-Track DAW**: 6-track workstation with pan, mute/solo, FX chains, Piano Roll, Vocal Intelligence, Mastering Telemetry & MP3/WAV export, and bidirectional Audacity project bridge.
- **Virtual DJ Console**: Dual-deck console (Deck A / Deck B) with vinyl scratch emulation, crossfader, Camelot harmonic wheel, tempo pitch shift, 3-band EQ kills, and Kaoss FX pad.
- **Offline Library Vault**: Cache downloaded songs and studio bounces in browser IndexedDB (`Offline Library` tab) for zero-internet playback, queue auto-next, audio import/export, and Beat Pad chopping.
- **Wireless Device Installer & Adaptive Layout**: Tap the Build Number 7 times online (`Install -> About Device`), pair phones/tablets/laptops wirelessly via QR code, and auto-adapt layouts (`Phone`, `Tablet`, `Laptop`, `Desktop`).
- **Quick Command Palette (`Ctrl+K` / `Cmd+K`)**: Instant keyboard launcher for switching workspaces, setting BPM presets, toggling metronome, or opening 3D Stage & Account settings.
- **Resilient Account, Sign-Up & Dual-Layer Security**: Full `Create Account` / `Sign In` / `Forgot Password` flows, Phone SMS OTP, Email OTP, Google Pop-Up & Redirect sign-in, Portable `.json` Profile Backup/Restore, and automatic **Google reCAPTCHA v3 + Adaptive SoundDeck Human Security Shield** that continues working cleanly even on unlisted domains or static mirrors.

## Deployment Flexibility

SoundDeck Studio runs seamlessly in **two deployment modes**:

### 1. GitHub Pages / Static Hosting (`dist/` only)
All bundled images, audio DSP, IndexedDB Offline Library, DAW synthesis, Virtual DJ console, iTunes Discover search, and local Adaptive Security challenges work directly in the browser without requiring a Node server:
- Automatic workflow included in `.github/workflows/deploy-pages.yml` (`VITE_BASE_PATH="/<repo-name>/"`).
- Or build manually:
  ```bash
  VITE_BASE_PATH="/your-repo-name/" npm run build:static
  ```
- Optional: set `VITE_API_ORIGIN="https://your-api-server.example.com"` if you host the frontend on GitHub Pages while pointing `/api/*` requests to a separate Node server.

### 2. Full-Stack Node.js Server (Cloud Run, Render, Railway, VPS, Local)
Includes Gemini AI Studio Assistant streaming, server-side audio FFmpeg conversion, SoundCloud/YouTube lookup, and SMS/Email OTP delivery:
```bash
npm install
npm run build
npm start
```
Environment variables (see `.env.example`):
- `PORT` (defaults to `3000`)
- `GEMINI_API_KEY` (required for live cloud Gemini AI features)
- `VITE_RECAPTCHA_SITE_KEY` & optional `RECAPTCHA_SECRET_KEY` (for Google reCAPTCHA v3; add your custom domain in Firebase Console -> Authentication -> Settings -> Authorized domains & Google reCAPTCHA Admin).

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Three.js, Tone.js, Lucide Icons, PWA Service Worker (`vite-plugin-pwa`)
- **Audio Engine**: Web Audio API, AudioWorklet, OfflineAudioContext rendering, WAV + MP3 (`lamejs`) encoding, IndexedDB audio blob vault
- **Backend**: Node.js, Express, `@google/genai`
- **Database & Auth**: Firebase Firestore & Firebase Auth with local backup resilience
