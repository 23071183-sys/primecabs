# PrimeCabs Customer (Flutter)

Android and iPhone app for booking seats: search, review and hold seats, pay, e-ticket with boarding codes, bookings and cancellation with refund.

```bash
cd apps/customer_flutter
flutter pub get
flutter test                      # widget tests
flutter run -d chrome --dart-define=API_URL=http://localhost:4000              # local API
flutter run --dart-define=API_URL=https://primecabs-api.onrender.com           # hosted API, on a phone or simulator
```

Without `API_URL`, the app uses `localhost:4000` (web and iOS Simulator) or `10.0.2.2:4000` (Android emulator).

Payments: with the server's test gateway (`PAYMENT_PROVIDER=fake`) a test checkout sheet stands in for Razorpay and no money moves. The Razorpay checkout itself is added once the account's test keys exist.
