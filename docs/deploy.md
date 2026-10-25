# Deploying PrimeCabs

The backend and admin portal run on **Render** (Singapore). The mobile apps run in **Expo Go** and talk to the hosted API.
Everything is described in [`render.yaml`](../render.yaml), so Render creates it all from the GitHub repo in one go.

## What Render creates

| Name | What | Plan | About |
|---|---|---|---|
| `primecabs-api` | Fastify API, runs migrations and the seed before each deploy | Starter, Singapore | $7/month |
| `documents` disk | Driver documents, mounted at `/var/data` | 1 GB | $0.25/month |
| `primecabs-db` | PostgreSQL 17, private to Render | Basic 256 MB, Singapore | $6/month |
| `primecabs-admin` | Admin portal (static site) | Free | $0 |

About $13/month (≈ ₹1,100). Every push to `main` deploys automatically.

> **This is a test (staging) server.** `NODE_ENV=staging` uses the fake SMS sender (sign-in codes are shown in the app) and the fake payment gateway. Anyone with the URL can sign in as any phone number, so **use only demo data**. Switch to `production` once MSG91 and Razorpay are set up (below).

## First deploy (once)

1. Sign in at https://dashboard.render.com with GitHub (account **23071183-sys**) and add a payment method (Starter and the database are paid).
2. Click **New → Blueprint**, pick the **primecabs** repository, branch `main`. Render reads `render.yaml`.
3. Render asks for the values marked `sync: false`:
   - **ADMIN_EMAIL**: the first super admin's email.
   - **ADMIN_PASSWORD**: a strong password (12+ characters). Keep it in a password manager.
   - Leave the Razorpay and MSG91 fields **empty** for now.
4. Click **Apply**. The first build takes about 5 minutes. When `primecabs-api` shows **Live**, open `https://primecabs-api.onrender.com/health`. It should show `{"ok":true}`.
5. Open the admin portal at `https://primecabs-admin.onrender.com` and sign in with ADMIN_EMAIL / ADMIN_PASSWORD.

If Render gives a service a different address (e.g. `primecabs-api-x1y2.onrender.com` when the name is taken), use that address in the steps below.

## Point the mobile apps at the hosted API

The driver app finds the API from `EXPO_PUBLIC_API_URL`. In `apps/driver/.env` (not committed):

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
- **Database backups**: Render keeps daily backups on paid database plans (Dashboard → primecabs-db → Recovery).
- **Rollback**: Dashboard → primecabs-api → Events → pick an earlier deploy → Rollback.
- **Secrets**: change them in Render → Environment. Changing `DATA_ENCRYPTION_KEY` makes stored bank account numbers unreadable, so don't rotate it without a migration.
