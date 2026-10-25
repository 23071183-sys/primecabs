# PrimeCabs API (Phase 1)

Base URL: `/api/v1`. JSON in and out. Money is integer **paise** (₹550 = `55000`). Times are ISO 8601 UTC; apps show them in IST.

Every error has one shape, with the right HTTP status:

```json
{ "error": { "code": "SEATS_UNAVAILABLE", "message": "Only 2 seats left", "details": { "availableSeats": 2 } } }
```

Sign-in returns a JWT. Send it as `Authorization: Bearer <token>`. Customer and driver tokens last 30 days, admin tokens 12 hours. `POST /auth/refresh` swaps a valid token for a new one.

## Auth
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | /auth/otp/request | `{phone, app: customer\|driver}` | 6-digit code, 5 min expiry, 30 s resend, 5 per hour. `devCode` is returned in development only. |
| POST | /auth/otp/verify | `{phone, otp, app}` | → `{token, user, isNewUser, profileComplete}`. 5 tries. A phone number belongs to one app only. |
| POST | /auth/refresh | — | New token |
| POST | /auth/admin/login | `{email, password}` | Locks for 15 min after 5 failures |

## Public
`GET /cities` (with pickup points) · `GET /routes` · `GET /vehicle-types` · `GET /document-types` · `GET /config` (hold minutes, GST, refund policy, support) · `GET /health` (outside `/api/v1`)

## Customer (customer token)
| Method | Path | Notes |
|---|---|---|
| GET/PUT | /me | Name, email, age and gender are required before booking |
| GET | /rides/search?fromCityId&toCityId&date=YYYY-MM-DD&seats | IST date. Full rides come back with `available:false` and `unavailableReason` |
| GET | /rides/:id | Ride with pickup points for both cities |
| POST | /bookings/quote | `{rideId, seats, pickup, drop}`. A stop is `{pointId}` or `{address}` (spoke towns only) |
| POST | /bookings | Quote body plus `passengers[{name, phone, age, gender}]`, one per seat → `HELD` booking with a 5-min hold |
| GET | /bookings?tab=upcoming\|past\|cancelled | |
| GET | /bookings/:id | E-ticket: start codes until boarded, end codes once on board |
| POST | /bookings/:id/pay | Creates the gateway order → `{provider, keyId, orderId, amount}` |
| POST | /payments/verify | `{bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature}` |
| POST | /payments/fake-checkout | Development only: returns what Razorpay checkout would |
| GET | /bookings/:id/cancel-preview | Refund % and amount if cancelled now |
| POST | /bookings/:id/cancel | `{reason?}` |

## Driver (driver token)
| Method | Path | Notes |
|---|---|---|
| GET/PUT | /driver/me | Profile, bank/UPI (account number is stored encrypted), document checklist |
| POST, PUT | /driver/vehicles, /driver/vehicles/:id | Editing sends the vehicle back for review |
| POST | /driver/documents | multipart: fields `documentTypeId`, `vehicleId?`, `expiryDate?` **before** `file`. JPG/PNG/PDF, max 5 MB |
| POST | /driver/submit | DRAFT/REJECTED → PENDING once everything required is in |
| GET | /driver/rides?scope=upcoming\|past | |
| POST | /driver/rides | `{vehicleId, routeId, departureAt, totalSeats, seatFare}` → PENDING_APPROVAL, plus `returnSuggestion` |
| GET/PUT | /driver/rides/:id | Passenger list (codes never shown). Edits only while unbooked; a fare change needs approval again |
| POST | /driver/rides/:id/cancel | `{reason}`. Every customer gets 100% back |
| POST | /driver/rides/:id/passengers/:pid/start | `{otp}`, opens 2 h before departure |
| POST | /driver/rides/:id/passengers/:pid/end | `{otp}` |
| POST | /driver/rides/:id/passengers/:pid/no-show | After departure time |
| POST | /driver/rides/:id/complete | When nobody is waiting or on board |
| GET | /driver/earnings | Last 7 and 30 days, upcoming |

## Admin (admin token; role checked on every call)
| Area | Endpoints | Who |
|---|---|---|
| Overview | `GET /admin/me` (includes the role's `permissions`, which the portal uses to show or hide screens), `GET /admin/overview` (counts, money in the last 24 h, next departures) | all |
| Drivers | `GET /admin/drivers`, `GET /admin/drivers/:id`, `POST …/approve\|reject\|suspend\|reinstate` | read: location, support · act: location |
| Documents | `GET /admin/documents/:id/url` (5-min signed link, logged), `POST /admin/documents/:id/approve\|reject`, `POST /admin/vehicles/:id/approve\|reject` | location |
| Rides | `GET /admin/rides?status`, `GET /admin/rides/:id`, `POST …/approve {seatFare?}`, `…/reject {reason}`, `…/cancel {reason}` | location |
| Bookings | `GET /admin/bookings?q&status`, `GET /admin/bookings/:id`, `POST …/cancel {reason, refund: POLICY\|FULL}` | location, support (POLICY only), accountant (read) |
| Money | `GET /admin/payments`, `GET /admin/refunds`, `POST /admin/refunds/:id/retry` | accountant |
| Config | `/admin/cities`, `/admin/pickup-points`, `/admin/routes` (creates the reverse route too), `PUT /admin/route-fares`, `/admin/vehicle-types`, `/admin/document-types` | write: super admin |
| Settings | `GET /admin/settings`, `PUT /admin/settings/:key {value}` | write: super admin |
| Staff | `/admin/admin-users`, `GET /admin/audit-logs` | super admin |

Location admins only see drivers whose home city is in their cities, and rides and bookings on routes that start or end there. Super admins can do everything.

## Webhook
`POST /webhooks/razorpay`: header `x-razorpay-signature`, handles `payment.captured` and `payment.failed`.
