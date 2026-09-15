# موعد mobile (APK path)

Expo WebView shell that loads the Maw3ed public booking web surface from the same API host.

## Why WebView first

Fastest path to an installable **APK** while Admin/Public web stabilize on one API. Native screens come in build-plan phase 3.

## Setup

```bash
cd mobile
npm install
# set extra.apiBaseUrl in app.json to your LAN API (Android emulator: http://10.0.2.2:7000)
npx expo start
```

## APK preview (EAS)

```bash
npm i -g eas-cli
eas login
eas build -p android --profile preview
```

Brand: **موعد / Maw3ed** · UpNexa-eg.com. Package id: `com.upnexa.maw3ed`.
