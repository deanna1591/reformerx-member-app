# ReformerX Member App

A gamified member app for the ReformerX Pilates studio (Prague 1): QR check-ins at the studio entrance, challenges, badges, challenge rewards, and a desktop admin dashboard — while SimplyBook keeps handling memberships and payments during Phase 1.

Built as a **PWA**: members install it straight from the browser ("Add to Home Screen") — no App Store or Google Play needed. It gets its own icon, runs full-screen, and can use the camera for QR scanning.

## Run it

```bash
npm install
npm run dev
```

- **Member app** (open on a phone, or in mobile view): http://localhost:3000
- **Admin dashboard** (desktop): http://localhost:3000/admin

### Demo accounts
| Who | Login | Notes |
|---|---|---|
| Member | `petra@example.com` | Active Monthly Pass, has a class booked **starting ~10 min after first run** so you can test check-in immediately |
| Member | `jana@example.com` | Unlimited, leaderboard rival |
| Member | `eliska@example.com` | **Expired** membership — demonstrates blocked check-in |
| Admin | password `reformerx` | Set `ADMIN_PASSWORD` env in production |

### Try the full loop
1. Sign in as Petra → Home shows membership pass + next class.
2. Tap the big **QR button** → scan the studio QR (open **/admin/studio-qr** on another screen), or type `RX-STUDIO-CHECKIN`.
3. Check-in validates: active membership → booked class → ±30 min window → not already checked in. Then challenge progress moves, badges can pop — and completing a challenge unlocks its reward, which appears in the studio's fulfillment queue.
4. In **Admin → Challenges**, publish a new challenge — every member gets a notification instantly.
5. Petra's demo check-in completes **10 Classes in 30 Days** live — the reward (grip socks) is unlocked on screen and lands in **Admin → Rewards** for fulfillment: Mark ready → member is notified → Mark collected at handover.

## What's enforced at check-in (anti-cheat)

- No active membership → rejected (SimplyBook is the source of truth)
- No booked class right now → rejected (bookings come from the WordPress flow / SimplyBook)
- Outside the window (30 min before class start → 30 min after class end) → rejected
- Already checked in for that class → rejected (also a DB unique constraint in production)

## Architecture

```
SimplyBook (memberships + payments + bookings via widget)
        │  REST v2 sync + webhooks (built in: src/lib/simplybook.ts)
        ▼
              Next.js app (this repo)
   ┌───────────────────────────────────────────────┐
   │  Check-in engine · Challenge engine · Badges  │
   │  Challenge rewards · Notifications            │
   └──────────────┬────────────────┬───────────────┘
                  ▼                ▼
        Member PWA (mobile)   Admin dashboard (desktop)
```

- **Demo mode (default):** data lives in `.data/db.json`, seeded with realistic ReformerX data (real instructor names, class schedule, three members). Zero external services — clone and run.
- **Production:** run `supabase/schema.sql` on Supabase (schema, RLS, and a server-side `perform_check_in` RPC are already written), swap the store for Supabase queries, sign in with Supabase Auth magic links. See `docs/SIMPLYBOOK_INTEGRATION.md`.

## Deploy (fastest path)

1. Push this repo to GitHub, import into **Vercel** → deploy. Set `ADMIN_PASSWORD`.
2. Point a domain at it (e.g. `app.reformerx.cz`). HTTPS is required for camera access and PWA install — Vercel handles it.
3. Members visit the link → browser prompts (Android) or Share → **Add to Home Screen** (iOS). Done — it's on their phone.
4. When ready for real data: create the Supabase project, run the schema, add the SimplyBook API User Key to env vars (`.env.example` lists them), set the webhook URL — see `docs/SIMPLYBOOK_INTEGRATION.md`.

## Structure

```
src/lib/store.ts        seeded data store (swap for Supabase later)
src/lib/engine.ts       check-in validation, challenge & badge logic, stats, leaderboards
src/app/actions.ts      all server actions (member + admin)
src/app/(member)/       mobile member app: home, challenges, check-in, rewards, profile
src/app/admin/          desktop dashboard: analytics, challenge builder, members, redemptions
src/components/         Scanner (camera + jsQR), QRDisplay, CarriageProgress, BottomNav
supabase/schema.sql     production schema + RLS + check-in RPC
docs/                   SimplyBook & WordPress integration guide
public/                 PWA manifest, service worker, icons
```

## Also built in

- **Bring a Friend + referral tracking** — every member's QR code doubles as a referral code; a friend enters it on first sign-in, and their first check-in completes the referrer's Bring a Friend challenge
- **Monthly attendance goals** — the `monthly_count` challenge type resets each calendar month (seeded: Monthly Rhythm, 8 classes → smoothie)
- **Personal records** — longest streak, best month, first class, friends brought in (on the profile)
- **Social sharing** — share records and invites via the native share sheet (Web Share API, clipboard fallback)
- **Web Push notifications** — real push for reward-ready, challenge completions, and announcements. Generate keys with `npx web-push generate-vapid-keys`, set the three VAPID env vars (see `.env.example`), and members opt in from their profile. On iOS this requires the installed PWA (iOS 16.4+), which the app already encourages.

## Roadmap hooks already in place

- **Leaderboards** — built, with a studio-level on/off switch (some studios dislike public rankings)
- **Phase 2/3** (in-app booking, Apple Wallet pass, NFC, AI coach) — the data model (classes, bookings, check-ins) already supports them
