# AccentNinja

**English pronunciation coach for French speakers.**
Static PWA — no build step, no backend, hostable on GitHub Pages.

---

## Features

- Real-time pronunciation assessment via **Azure Speech SDK** (phoneme-level IPA feedback)
- Free fallback using the **Web Speech API** (word-level)
- Progressive difficulty across **10 levels**
- Gamified **Ninja Mode** results display
- Full offline support via Service Worker
- Dark / light themes
- Bilingual UI (French / English)
- All data stays on your device (IndexedDB)

---

## Quick Start

### Option A — GitHub Pages (recommended)

1. Fork this repository
2. Go to **Settings → Pages** → Source: `main` branch, root folder
3. Open `https://{your-username}.github.io/accentninja/`

### Option B — Local

```bash
git clone https://github.com/your-username/accentninja.git
cd accentninja
# Serve with any static server (required for ES modules and Service Worker)
npx serve .
# or: python3 -m http.server 8080
```

Then open `http://localhost:8080` in Chrome, Edge or Safari.

> **Note:** Opening `index.html` directly via `file://` will not work due to ES module CORS restrictions and Service Worker requirements.

---

## Azure Speech API Key Setup

Azure is **optional** but enables full phoneme-level IPA feedback.

### Free tier
- 5 audio hours / month
- ~1,500 short utterances / month
- No credit card required for the free tier

### Steps

1. Sign in to [portal.azure.com](https://portal.azure.com)
2. Create a **Speech** resource (Cognitive Services → Speech)
3. Choose the free **F0** pricing tier
4. Copy your **Key 1** and the **Region** (e.g. `westeurope`)
5. Paste them into **AccentNinja → Settings → Azure Credentials**

> Your API key is stored in the browser's IndexedDB and is **never sent anywhere except directly to Azure Speech endpoints** over HTTPS.

---

## File Structure

```
accentninja/
├── index.html        # App shell (HTML + PWA meta tags)
├── style.css         # Design system (dark/light themes, mobile-first)
├── app.js            # Core app logic (routing, state, IndexedDB, screen rendering)
├── engines.js        # TTS + pronunciation assessment engine abstraction
├── corpus.js         # Training data (CORPUS, MINIMAL_PAIRS, PHONEME_TIPS)
├── i18n.js           # Bilingual string table (FR/EN) + t() helper
├── sw.js             # Service Worker (offline caching)
├── manifest.json     # PWA manifest
├── icons/
│   ├── icon-192.svg  # App icon (replace with PNG for full iOS support)
│   └── icon-512.svg
└── voice.html        # Standalone Azure pronunciation test page (dev tool)
```

### iOS icon note

Safari on iOS requires **PNG** icons for "Add to Home Screen". The included icons are SVG. For full iOS PWA support:

1. Convert `icons/icon-192.svg` → `icons/icon-192.png` (192×192)
2. Convert `icons/icon-512.svg` → `icons/icon-512.png` (512×512)
3. Update `manifest.json` to reference the `.png` files

Online converters: [svgtopng.com](https://svgtopng.com) or use Inkscape/ImageMagick.

---

## Browser Support

| Browser | TTS | Assessment |
|---------|-----|-----------|
| Chrome 90+ | ✅ Web Speech + Azure | ✅ Both |
| Edge 90+   | ✅ Web Speech + Azure | ✅ Both |
| Safari 15+ (iOS) | ✅ Web Speech + Azure | ✅ Both |
| Firefox    | ✅ Web Speech | ⚠️ Azure only (no webkitSpeechRecognition) |

---

## Audio Pipeline

```
Azure mode:
  Azure SDK AudioConfig.fromDefaultMicrophoneInput()
    └─ SDK handles PCM conversion + streaming to Azure endpoint
    └─ Returns phoneme-level IPA scores

  Parallel MediaRecorder (getUserMedia)
    └─ Captures audio blob for "Replay your recording" button only
    └─ Blob stored in memory, discarded on next item

Web Speech fallback:
  webkitSpeechRecognition / SpeechRecognition
    └─ Returns transcript + confidence score
    └─ Word-level diff computed against reference text
```

---

## Privacy

- No analytics, no tracking, no server
- Azure API key stored locally in IndexedDB
- Audio is streamed directly to Azure and immediately discarded
- No audio is stored permanently (replay blob is in-memory only)
- Export/import your progress data at any time

---

## License

MIT — see [LICENSE](LICENSE)
