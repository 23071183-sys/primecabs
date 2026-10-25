# Deploying PrimeCabs

The backend and admin portal run on **Render** (Singapore). The mobile apps (Flutter) talk to the hosted API.
Everything is described in [`render.yaml`](../render.yaml), so Render creates it all from the GitHub repo in one go.

## What Render creates (free plan)

| Name | What | Plan | Cost |
|---|---|---|---|
| `primecabs-api` | Fastify API. Runs migrations and the seed each time it starts | Free, Singapore | $0 |
| `primecabs-db` | PostgreSQL 17, private to Render. Also holds uploaded driver documents | Free, Singapore | $0 |
| `primecabs-admin` | Admin portal (static site) | Free | $0 |

Every push to `main` deploys automatically.

**Free-plan limits to know:**
- **The API sleeps after 15 minutes without requests.** The next request wakes it, which takes about a minute (longer right after a deploy, because migrations and the seed run first). Seat holds still expire correctly: they are checked on every request.
- **Render deletes a free database 30 days after it is created** (you get an email first). Before then, either upgrade it in Render (Basic, about $6/month, keeps the data), or move to a free Supabase or Neon database: create one, put its connection string in the API's `DATABASE_URL`, and redeploy.
- **No disk**, so driver documents are stored in the database (`STORAGE_PROVIDER=database`). The free database has 1 GB, enough for a few hundred drivers' documents.

> **This is a test (staging) server.** `NODE_ENV=staging` uses the fake SMS sender (sign-in codes are shown in the app) and the fake payment gateway. Anyone with the URL can sign in as any phone number, so **use only demo data**. Switch to `production` once MSG91 and Razorpay are set up (below).

## First deploy (once)

1. Sign in at https://dashboard.render.com with GitHub (account **23071183-sys**). No payment method is needed for the free plan.
2. Click **New → Blueprint**, pick the **primecabs** repository, branch `main`. Render reads `render.yaml`.
3. Render asks for the values marked `sync: false`:
   - **ADMIN_EMAIL**: the first super admin's email.
   - **ADMIN_PASSWORD**: a strong password (12+ characters). Keep it in a password manager.
   - Leave the Razorpay and MSG91 fields **empty** for now.
4. Click **Apply**. The first build and start take about 5 to 10 minutes. When `primecabs-api` shows **Live**, open `https://primecabs-api.onrender.com/health`. It should show `{"ok":true}`.
5. Open the admin portal at `https://primecabs-admin.onrender.com` and sign in with ADMIN_EMAIL / ADMIN_PASSWORD.

If Render gives a service a different address (e.g. `primecabs-api-x1y2.onrender.com` when the name is taken), use that address in the steps below.

## Point the mobile apps at the hosted API

**Flutter driver app** (`apps/driver_flutter`): pass the API address when running or building:

```bash
cd apps/driver_flutter && flutter run --dart-define=API_URL=https://primecabs-api.onrender.com
```

The same `--dart-define` goes on `flutter build apk` or `flutter build ipa` for test builds.

**Expo driver app** (`apps/driver`, kept for reference): set `EXPO_PUBLIC_API_URL` in `apps/driver/.env` (not committed):

```
EXPO_PUBLIC_API_URL=https://primecabs-api.onrender.com
```

Then `npm run driver:start` and scan the QR code with Expo Go. Testers' phones no longer need to be on your Wi-Fi to reach the API.
(The app's JavaScript still comes from your Mac's Expo server. Publishing it with EAS Update so testers can open it without your Mac running is the next step.)

## Demo data on the hosted server

`SEED_DEMO=true` creates the same demo drivers, ride, customer and staff accounts as locally (see the README). The demo staff accounts use ADMIN_PASSWORD. Set `SEED_DEMO=false` in Render before any real use.

## Going live later

1. **Razorpay**: create the account, copy the **test** keys into Render (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`), add a webhook to `https://primecabs-api.onrender.com/api/v1/webhooks/razorpay` for `payment.captured` and `payment.failed` and copy its secret into `RAZORPAY_WEBHOOK_SECRET`, then set `PAYMENT_PROVIDER=razorpay`.
2. **SMS**: after DLT registration, add `MSG91_AUTH_KEY` and `MSG91_TEMPLATE_ID` and set `SMS_PROVIDER=msg91`.
3. Set `SEED_DEMO=false` and `NODE_ENV=production`. The API refuses to start in production while any fake provider is still switched on.
4. Add your own domains in Render (for example `api.primecabs.in`, `admin.primecabs.in`), update `CORS_ORIGINS` and the apps' `EXPO_PUBLIC_API_URL`.

## Operations

- **Logs**: Render dashboard → service → Logs.
- **Database backups**: only on paid database plans (Dashboard → primecabs-db → Recovery). On the free plan there are none.
- **Rollback**: Dashboard → primecabs-api → Events → pick an earlier deploy → Rollback.
- **Secrets**: change them in Render → Environment. Changing `DATA_ENCRYPTION_KEY` makes stored bank account numbers unreadable, so don't rotate it without a migration.

## Moving off the free plan

When PrimeCabs needs to stay awake and keep its data: in `render.yaml` set the API to `plan: starter` (about $7/month) and the database to `plan: basic-256mb` (about $6/month), or upgrade both in Render's dashboard. Documents can stay in the database, or switch to a disk (`STORAGE_PROVIDER=local`, `STORAGE_DIR=/var/data/storage` and a `disk:` block) once the API is on a paid plan.
