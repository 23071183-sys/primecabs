# PrimeCabs decisions and defaults (Phase 1)

Sources, in priority order: `docs/client_answers.md` (the client's PDF), then CLAUDE.md. The Emergent prompt files and the prototype are for screen ideas only.
Numbers in brackets refer to PDF questions. Every value marked *setting* lives in the database and admin can change it.

## Phase 1 scope
Admin approves a driver → driver publishes a shared ride with a proposed fare → admin approves the ride and fare → customer books with a seat hold → pays (test mode) → e-ticket → each passenger boards and drops with their own start/end OTP → customer can cancel for a tiered refund.
Shared rides only. One-way drops, rentals, round trips, carpool, ratings, coupons, surge pricing, notifications, extra languages, website booking, SOS, tracking, payouts, reports and Google login come later.

## Defaults until the client says otherwise
| # | Topic | Default | Why |
|---|---|---|---|
| D1 | Commission (*setting*) | Model `BY_PLATE`: yellow 10%, white 15%, on the fare before GST | 14.6 confirmed; contradicts 4.6/4.7 (same % for all drivers, under 10%, subscription). Ask the client. |
| D2 | GST (*setting*) | `INCLUDED` at 5%: GST = total × 5/105 | 4.5; 14.5 says "Change" with no text |
| D3 | Fare approval | Driver proposes the per-seat fare. Admin can approve, approve with a changed fare, or reject with a reason. Only approved rides are searchable. | 2.4, 4.1, 14.9 |
| D4 | Seed area | Nagpur hub (railway station ₹0, Ganeshpeth bus stand ₹0, airport +₹100) with spokes Seoni (~130 km) and Chhindwara (~125 km) | 3.1; 3.2 is blank |
| D5 | Vehicle types (*setting*) | Passenger seats: Hatchback 4, Sedan 4, SUV 6, Ertiga 6, Tempo Traveller 12, Urbania 13 | 5.6, 14.3 |
| D6 | Seats per booking | Up to the number of free seats | 2.2 |
| D7 | Seat hold (*setting*) | 5 minutes | 6.4, 14.2 |
| D8 | Refund tiers (*setting*) | ≥24 h 100%, ≥12 h 75%, ≥4 h 50%, else 0%. Percentage of the full amount paid, rounded down to the rupee. Driver or admin cancellation: 100%. Company pays gateway fees. | 7.4–7.6, 14.7 |
| D9 | Trip OTPs | Each passenger gets a 4-digit START code and END code, unique within the ride, shown on the booker's e-ticket. 5 wrong tries per code. Driver can mark a no-show after departure time. Ride completes when every passenger is dropped or a no-show. | 5.10 |
| D10 | Payment | Razorpay, full amount online for shared rides. A `FAKE` adapter is used until test keys are supplied. | 7.2, 7.3 |
| D11 | Pickup and drop | Hub: fixed points with an optional extra fare. Spoke: fixed points or a typed home address with a per-town add-on fee (default ₹0), no distance check yet. Extras count toward the driver's gross. | 3.4–3.6 |
| D12 | Booking window (*setting*) | Up to 30 days ahead; booking closes 15 min before departure | 2.6, 2.7 |
| D13 | Customer profile | Login by phone OTP. Name, phone, email, age and gender required. Each traveller: name, phone, age, gender. | 6.1–6.3 |
| D14 | Documents (*setting*) | Driver: DL, Aadhaar, PAN, selfie, TR licence (only if a vehicle has a yellow plate); bank/UPI as form fields. Vehicle: RC, insurance, route permit, car photos. Private storage, short-lived links, never deleted automatically. | 5.1–5.3 |
| D15 | Vehicles | A driver can have several vehicles, each approved separately. Fleet owners come later. | 5.7 |
| D16 | Return trip | After publishing, offer "Publish return trip?" with the form pre-filled | 2.5 |
| D17 | Editing a ride | Only while it has no bookings. A fare change needs approval again. Cancelling a ride with bookings refunds 100%. | — |
| D18 | Admin roles | SUPER_ADMIN: everything. LOCATION_ADMIN: drivers, rides, fares and bookings in their cities. SUPPORT: view and cancel with policy refund. ACCOUNTANT: read payments and refunds, retry refunds. | 8.2 |
| D19 | Money and time | Integer paise in the database; UTC stored, IST shown | CLAUDE.md |

## Open questions for the client
- Commission model (D1) and GST change (D2).
- Full text of 2.4 (cut off at "In future, will automa…").
- Routes and distances (3.2), support phone/email/address (11.5), app name (11.6), logo file (11.1).
- All of section 12 (store accounts, domain, SMS provider, maps, code ownership, data location) and 13.1–13.6 (launch date, budget).
- GSTIN and invoice format (7.9).
