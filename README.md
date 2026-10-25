# PrimeCabs

Scheduled intercity shared cabs for Tier-2/3 India. One backend and database serve three apps: Customer (Android + iPhone), Driver (Android) and the Admin Portal (web).

Requirements: [docs/client_answers.md](docs/client_answers.md). Defaults and open questions: [docs/decisions.md](docs/decisions.md). API reference: [docs/api.md](docs/api.md). Hosting: [docs/deploy.md](docs/deploy.md). Work tracking: [GitHub project board](https://github.com/users/23071183-sys/projects/4).

## Status

| Step | What | State |
|---|---|---|
| a | Backend, database, seed data, tests (`apps/api`) | Built |
| b | Admin Portal (`apps/admin`) | Built |
| c | Driver App (`apps/driver`) | Built |
| d | Customer App (`apps/customer`) | Next |

## Run it on this Mac

Node 24 is installed in `~/.local/node`. Add it to your shell once:

```bash
echo 'export PATH="$HOME/.local/node/bin:$PATH"' >> ~/.zprofile && source ~/.zprofile
```

Then, from the `primecabs` folder:

```bash
npm install
```

Start the database in its own terminal tab and leave it running (data is kept in `apps/api/.pgdata`):

```bash
npm run db:start
```

In a second tab, create the tables and load the seed data (safe to run again):

```bash
npm run db:migrate && npm run db:seed
```

Start the API on http://localhost:4000:

```bash
npm run api:dev
```

In a third tab, start the Admin Portal on http://localhost:5173 (it reaches the API through a built-in proxy):

```bash
npm run admin:dev
```

Start the Driver App. Either preview it in a browser at http://localhost:8081:

```bash
npm run driver:web
```

or run it on a phone with Expo Go (same Wi-Fi as this Mac; scan the QR code):

```bash
npm run driver:start
```

The app finds the API on this Mac automatically. To use the hosted API instead, see [docs/deploy.md](docs/deploy.md).

Run all tests (the database must be running):

```bash
npm test
```

## Development accounts

- **Super admin:** `admin@primecabs.local`, password in `apps/api/.env` (`ADMIN_PASSWORD`).
- **Demo admins** (same password): `location@primecabs.local` (Nagpur), `support@primecabs.local`, `accounts@primecabs.local`.
- **Demo driver, approved:** phone 90000 00001 (Ramesh, Ertiga MH31AB1234, yellow plate). He has an open ride Nagpur → Seoni tomorrow at 7:30 AM (₹550/seat) and a return ride waiting for fare approval.
- **Demo driver, pending approval:** 90000 00002 (Sunil, Dzire, white plate).
- **Demo customer:** 90000 00003 (Anita, profile complete).

Phone sign-in uses a fake SMS sender in development. The code is printed in the API log and returned as `devCode` in the `/auth/otp/request` response. Payments use a fake gateway that behaves like Razorpay test mode. No real SMS is sent and no money moves.

## Keys and secrets

All keys live in `apps/api/.env`, which git ignores. `apps/api/.env.example` lists every variable. To switch on real services later, set `SMS_PROVIDER=msg91` (after DLT registration) and `PAYMENT_PROVIDER=razorpay` with **test** keys first.
