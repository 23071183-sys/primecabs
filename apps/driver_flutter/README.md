# PrimeCabs Driver (Flutter)

Android and iPhone driver app. Shared code lives in `packages/primecabs_core` (API client, models, formatting) and `packages/primecabs_ui` (theme and widgets).

```bash
cd apps/driver_flutter
flutter pub get
flutter test                      # widget tests
flutter run -d chrome --dart-define=API_URL=http://localhost:4000              # local API
flutter run --dart-define=API_URL=https://primecabs-api.onrender.com           # hosted API, on a phone or simulator
```

Without `API_URL`, the app uses `localhost:4000` (web and iOS Simulator) or `10.0.2.2:4000` (Android emulator).
Shared-package tests: `cd packages/primecabs_core && dart test`.
