# Mobile (React Native — Android first)

This package contains the JS/TS source. Native projects (`android/`, `ios/`) are NOT scaffolded here — generate them once, then drop these files in:

```bash
# from monorepo root
npx @react-native-community/cli@latest init CyberGallery --version 0.74.5 --skip-install --pm pnpm --directory apps/mobile-tmp
# move android/ + gradle files into apps/mobile, then:
rm -rf apps/mobile-tmp
pnpm install
cd apps/mobile && pnpm android
```

### Android permissions to add to `android/app/src/main/AndroidManifest.xml`

```xml
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"
                 android:maxSdkVersion="32" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
```

### Background fetch (gradle)

`react-native-background-fetch` requires a small entry in `android/build.gradle` — see its docs.

### Configure API base URL

Edit `src/config.ts`. Use `http://10.0.2.2:4817/api` for the Android emulator to reach your host machine.
