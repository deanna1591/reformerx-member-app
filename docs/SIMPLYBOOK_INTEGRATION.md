# SimplyBook integration (production)

**Status: the integration is built and included.** ReformerX's site uses the SimplyBook booking widget, so bookings live inside SimplyBook — no WordPress integration is needed. Everything (members, memberships, bookings) syncs from one API.

Already in the codebase:
- `src/lib/simplybook.ts` — REST v2 client: auth with an API User Key, paginated fetch of clients / memberships / bookings, idempotent upsert into the app's data store
- `src/app/api/webhooks/simplybook/route.ts` — webhook target for the "Run on creation / change / cancel" toggles; a webhook only *triggers* a re-sync, data is always re-fetched with our own credentials so forged webhooks can't inject anything
- Admin → Members → **Sync from SimplyBook** runs a real sync when keys are configured (shows a result banner), demo refresh otherwise

## Setup

1. SimplyBook admin → **Custom Features → API** → enable.
2. Follow the **API User Keys** link on that page and create a key (recommended over password auth, which requires email verification per server IP — a problem on hosts with rotating IPs like Vercel).
3. Copy `.env.example` → `.env.local` and fill in:
   - `SIMPLYBOOK_COMPANY` — your company login (subdomain)
   - `SIMPLYBOOK_LOGIN` — the user the key was created for
   - `SIMPLYBOOK_USER_KEY` — the key itself
4. Webhook toggles on the API page: **creation ON, change ON, cancel ON, reminder OFF.** After deploying, set the **Ticket callback URL** to `https://yourapp.cz/api/webhooks/simplybook` and press Impose. Open that URL in a browser first — it answers with `{ok: true, configured: true}` as a health check.
5. Add a scheduled full sync as a safety net (webhooks can be missed): Vercel Cron hitting the webhook GET/POST nightly, or any cron calling the endpoint.

## Endpoint notes

The client targets REST API v2 (`https://user-api-v2.simplybook.it`, configurable via `SIMPLYBOOK_API_BASE`):
- `POST /admin/auth` with company/login/key → token (cached ~50 min, auto-refreshed on 401)
- `GET /admin/clients` → members (matched by SimplyBook id, then email)
- `GET /admin/clients/memberships` → membership product + `period_end` → the app's `membershipExpires`. This endpoint belongs to the Membership custom feature; if your account exposes it under a different path, adjust it in `src/lib/simplybook.ts` (the sync degrades gracefully — clients and bookings still sync).
- `GET /admin/bookings?filter[date_from]=…&filter[date_to]=…` → classes + bookings for yesterday → +14 days; cancellations remove the booking so check-in gets rejected

Membership product names are mapped to app types in `mapMembershipType()` — adjust the keywords to match the exact product names ReformerX uses in SimplyBook.

## 1. SimplyBook — membership verification

SimplyBook.me exposes a JSON-RPC **Admin API** (`https://user-api.simplybook.me/admin`) plus REST endpoints and **webhooks/callbacks**.

### Getting credentials
1. In SimplyBook admin: **Custom Features → API** → enable, copy the **API key** and **API secret**.
2. Company login is the subdomain ReformerX uses on SimplyBook.

Set these in `.env.local`:

```
SIMPLYBOOK_COMPANY=reformerx
SIMPLYBOOK_API_KEY=...
SIMPLYBOOK_API_SECRET=...
```

### Sync strategy (recommended)
- **Nightly full sync** (cron / Vercel Cron): pull clients + their membership products, upsert into `members` (match on email), update `membership_type` and `membership_expires`.
- **Webhooks for instant updates**: subscribe to booking/client/invoice events so a purchase or renewal flips a membership to active within seconds. Point the callback at `https://yourapp.cz/api/webhooks/simplybook` and verify the signature.
- The app itself only ever reads `membership_expires` — the check-in rule "no active membership → no participation" stays a one-line comparison.

### Relevant Admin API methods
- `getClientList` — all clients (name, email, phone)
- `getClientMembershipList` / membership custom feature endpoints — active memberships, product, valid-until
- `getBookings` — bookings, filterable by date, useful to mirror bookings if the WP flow writes into SimplyBook

## 2. WordPress — booking sync (Phase 1)

Because members book through the WordPress site today, the app needs to know **who booked which class** to enforce "check-in only for booked classes."

Options, easiest first:
1. **If the WP booking plugin writes into SimplyBook** (typical for the SimplyBook WP widget): you don't need WordPress at all — pull bookings from SimplyBook's `getBookings` and you're done. **Check this first.**
2. **WP REST API**: most booking plugins expose bookings via `wp-json/...` endpoints. Poll every few minutes with an application password.
3. **Small WP plugin**: a 30-line plugin that fires a webhook to your app on every new booking.

Map each WP/SimplyBook event to a row in `classes` (per date+time+instructor) and each attendee to a `bookings` row.

## 3. Push notifications (production)

The PWA supports Web Push:
- **Android**: works out of the box once the PWA is installed.
- **iOS**: supported since iOS 16.4, but **only after the user adds the app to their Home Screen** — which this app asks them to do anyway.
- Use Firebase Cloud Messaging or plain VAPID Web Push. Trigger sends from the same places the demo writes in-app notifications (`notify()` in `src/lib/engine.ts`) — challenge completed, badge earned, admin announcement, "membership expiring soon."

## 4. Switching the app from demo data to Supabase

The demo persists to `.data/db.json` through `src/lib/store.ts`. To go to production:
1. Create a Supabase project, run `supabase/schema.sql`.
2. Replace reads/writes in `src/lib/engine.ts` + server actions with Supabase queries (`@supabase/supabase-js`). The types in `src/lib/types.ts` map 1:1 to the tables.
3. Move check-in validation to the `perform_check_in` RPC (already written in the schema) so anti-cheat rules are enforced server-side in the database.
4. Swap the email-only demo login for Supabase Auth magic links — members sign in with the same email they use in SimplyBook.
