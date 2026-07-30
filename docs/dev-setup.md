# Development database

`.env.local` points at production. Until now every `npm run dev` session and
every script in `scripts/` operated on live member data.

## 1. Create a second Supabase project

supabase.com → New project. Name it something like `reformerx-dev`. Free tier is
fine — it only ever holds a copy.

## 2. Create the table

SQL Editor → New query → run this:

```sql
create table if not exists app_state (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- The app connects with the service role key, which bypasses RLS. Enabling it
-- anyway means an accidentally-exposed anon key grants nothing.
alter table app_state enable row level security;
```

## 3. Create `.env.development.local`

Copy `.env.local`, then replace the two Supabase lines with the dev project's
values (Project Settings → API):

```
SUPABASE_URL=https://YOUR-DEV-REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR-DEV-SERVICE-ROLE-KEY
```

Next.js loads `.env.development.local` ahead of `.env.local` in development, so
`npm run dev` now uses dev automatically. Vercel is unaffected — it uses its own
environment variables.

Confirm it's ignored by git:

```bash
git check-ignore .env.development.local && echo ignored
```

## 4. Fill it with a copy of production

```bash
node scripts/seed-dev-from-prod.mjs --dry
node scripts/seed-dev-from-prod.mjs
```

One-way only. Member emails become `dev+…@example.invalid` and push
subscriptions are dropped, so a dev run can't message a real member.

## Day to day

- `npm run dev` → dev database
- `node scripts/<any>.mjs` → dev database
- adding `--prod` → production, and the script says so before writing

Scripts that write refuse production without `--prod`. Reads are never gated,
but always print which host they're on.

## When you genuinely need production

The recovery in July needed it — Vercel's Hobby plan caps functions at 60s and a
full SimplyBook sync takes ~140s, so it has to run locally:

```bash
npm run dev   # dev DB — will NOT sync production
```

For that case, run the dev server against production deliberately:

```bash
SUPABASE_URL=$(grep -m1 '^SUPABASE_URL=' .env.local | cut -d= -f2-) \
SUPABASE_SERVICE_ROLE_KEY=$(grep -m1 '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2-) \
npm run dev
```

Environment variables beat both files, so this is explicit and temporary. Stop
the server when you're done.
