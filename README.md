# 🛡️ Teen Safety Shield

AI-powered browser extension protecting minors from harmful online content through real-time face-based age verification.

## Features

- 🎯 **Real-time Age Verification** - Uses AI to estimate user age via webcam
- 🔒 **Privacy-First** - All processing happens locally, no data transmitted
- 🌐 **Cross-Browser** - Works on Chrome, Firefox, Edge, Opera
- ⚡ **Instant Protection** - Blocks harmful sites automatically
- 🚫 **Anti-Bypass** - Camera blocking triggers full lockdown

## Categories Blocked

- Adult/Pornographic content
- Gambling sites
- Betting platforms (Dream11, My11Circle, etc.)
- Dark web access

## Tech Stack

- **Extension API**: WebExtension (Manifest V3)
- **AI/ML**: face-api.js (TensorFlow.js based)
- **Models**: Tiny Face Detector + Age-Gender Net
- **Frontend**: Vanilla HTML/CSS/JavaScript

## Installation (Development)

1. Clone this repository
2. Download models: `./download-models.sh`
3. Open Chrome → Extensions → Enable Developer Mode
4. Click "Load unpacked" → Select project folder
5. Extension is now active!

## How It Works

1. User navigates to restricted site
2. Extension intercepts and triggers verification
3. Camera captures face → AI estimates age
4. If age < 18 → Site blocked
5. If camera blocked → All restricted sites blocked

## Privacy

- ✅ On-device AI inference
- ✅ No face data stored
- ✅ No external API calls
- ✅ GDPR/COPPA compliant

## Team

Built for [Hackathon Name] 2024

## License

MIT License