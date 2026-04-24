# CovA Mobile — Production Native App

## Architecture
React Native (Expo) → WebView → CovA Frontend Dashboard

This is a **production-ready native wrapper** that packages the CovA web dashboard as a native Android/iOS application.

## Quick Start

```bash
cd 03-app-mobile
npm install
npx expo start
```
Scan the QR code with **Expo Go** app on your phone to test instantly.

---

## Building for Production

### Option A: Generate APK (Direct Install)
```bash
# One-time setup
npm install -g eas-cli
eas login

# Build APK
npm run build:apk
```
This generates a downloadable `.apk` file you can install on any Android device.

### Option B: Open in Android Studio
```bash
# Generate native Android project
npm run prebuild

# Open the generated /android folder in Android Studio
# Build → Generate Signed Bundle / APK
```
This creates a full native `/android` directory with `build.gradle`, `AndroidManifest.xml`, etc. You can then open it directly in Android Studio and build like any standard Android app.

### Option C: Google Play AAB (App Bundle)
```bash
npm run build:aab
```
Generates an `.aab` file ready for Google Play Store submission.

---

## Features
- ✅ Native splash screen (CovA branded, #0F172A dark)
- ✅ Hardware back button support (navigates within WebView)
- ✅ Error recovery screen with retry
- ✅ Native → WebView JavaScript bridge
- ✅ Safe area support for notch devices
- ✅ `window.isNativeApp` flag for feature detection in web app
- ✅ Production/Development URL switching via `__DEV__` flag
- ✅ GPS permissions declared for telemetry features

## Configuration
Edit `PRODUCTION_URL` in `App.js` to point to your deployed frontend:
```js
const PRODUCTION_URL = 'https://cova.guidewire.app';
```
