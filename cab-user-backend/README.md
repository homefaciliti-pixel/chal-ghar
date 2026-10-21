# CAB User App Backend

Node.js + Express + MySQL backend starter based on `CAB User App final.pdf`.

## Requirements
- Node.js 20+
- MySQL 8+
- Razorpay account for online payments (optional during local development)
- An SMS provider for production OTP delivery

## Setup
1. Copy `.env.example` to `.env` and fill in database/JWT values.
2. Create the database, or let the init script create it if your MySQL user has permission:
   ```sql
   CREATE DATABASE cab_user_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
3. Install and initialize:
   ```bash
   npm install
   npm run db:init
   npm run dev
   ```
4. Health check: `GET http://localhost:5000/api/health`

## Important
- `OTP_DEV_MODE=true` logs OTPs to the server console for local testing. Do not use this in production.
- Production OTP delivery is intentionally not faked. Implement your chosen SMS provider in `src/services/otp.service.js`, configure secrets, and set `OTP_DEV_MODE=false`.
- Fare calculation is a clearly marked configurable placeholder because the PDF says fare is pending discussion. Set fare rules in `src/services/fare.service.js`.
- Driver dispatch, live driver GPS, WebSocket updates, scheduled rides, invoice PDF generation, push notifications, and admin/driver authentication require the corresponding driver/admin systems and are not simulated as real integrations here.
- Razorpay credentials are required for real online payments. Payment status must be verified server-side and ideally reconciled with signed Razorpay webhooks.
- Use HTTPS, secrets manager, SMS rate limits, monitoring, database backups, privacy/legal review, and security testing before production.
- The API follows the PDF's `/auth`, `/home`, `/rides`, `/wallet`, `/profile`, `/addresses`, `/promos`, `/support` style. Some routes return empty data until your admin/driver system seeds the required records.

## Implemented route groups
- Auth: login/register OTP, registration, logout
- Meta: languages, cancellation reasons
- Home, serviceability, banners, latest/active ride, nearby drivers, places autocomplete
- Ride create/detail/cancel/track/share/SOS/history/rating
- Payment methods, pay for ride, verify payment, wallet/top-up/transactions
- Profile read/update/photo delete and phone OTP flow, current location, account deletion request
- Saved addresses CRUD
- Promo list/validation
- Support FAQs/tickets/replies
- Emergency contacts CRUD

## Example
```bash
curl http://localhost:5000/api/health
curl -X POST http://localhost:5000/api/auth/login/send-otp \
  -H 'Content-Type: application/json' \
  -d '{"mobile_number":"9876543210"}'
```
Use the returned `otp_session_id` and the console OTP in `/auth/login/verify-otp`.

## API response format
Successful responses generally use `{ "status": true, "message": "...", "data": ... }`; errors use `{ "status": false, "message": "...", "code": "..." }`.
