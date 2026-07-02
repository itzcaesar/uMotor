<div align="center">

# uMotor

**Platform manajemen motor berbasis AstraPay** — a motorcycle-ownership platform where riders manage their bikes, book workshop service, track rides, and unlock financing from their maintenance behaviour. Workshops manage their queue and earnings; ops monitor everything from a web console.

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Expo](https://img.shields.io/badge/Expo-000020?style=flat&logo=expo&logoColor=white)](https://expo.dev/)
[![React Native](https://img.shields.io/badge/React_Native-61DAFB?style=flat&logo=react&logoColor=black)](https://reactnative.dev/)
[![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat&logo=supabase&logoColor=white)](https://supabase.com/)
[![pnpm](https://img.shields.io/badge/pnpm-F69220?style=flat&logo=pnpm&logoColor=white)](https://pnpm.io/)

</div>

> **Prototype.** Demo build — no real authentication, permissive row-level security, and mocked payments. Not production-ready by design.

---

## Apps

| App | Path | Stack | Audience |
|---|---|---|---|
| **Consumer** | `apps/consumer` | Expo · React Native | Rider — garage, bookings, MotoScore, marketplace, rides |
| **Partner** | `apps/partner` | Expo · React Native (phone + tablet) | Workshop — inbox, queue, QR check-in, earnings |
| **Console** | `apps/console` | Next.js App Router | Ops — web dashboard |
| **Shared** | `packages/shared` | TypeScript library (`@umotor/shared`) | Types, constants, theme, mocks |
| **Backend** | `supabase/` | Postgres + Edge Functions | Migrations, seed, RPCs, RLS, Realtime |

All three front-ends talk to a single hosted Supabase project.

## Highlights

- **MotoScore** — credit-style score derived from maintenance behaviour that unlocks financing.
- **Booking flow** — workshop discovery, live slot locking, AstraPay deposit, QR check-in.
- **Ride tracking** — foreground GPS + activity classification; server recomputes distance and rejects spoofed tracks.
- **Finance Hub** — STNK / installment bills, fuel top-up that organically advances the odometer.
- **Partner ops** — realtime inbox, queue, earnings, slot/capacity config, and a sparepart marketplace.

## Getting started

**Prerequisites:** [Node.js](https://nodejs.org/) (LTS), [pnpm](https://pnpm.io/), [Supabase CLI](https://supabase.com/docs/guides/cli), and [Expo Go](https://expo.dev/go) for mobile.

```bash
pnpm install

# Backend
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>
pnpm db:reset                              # applies migrations + seed

# Env — copy each template and fill in your Supabase URL + anon key
cp apps/console/.env.example   apps/console/.env.local
cp apps/consumer/.env.example  apps/consumer/.env
cp apps/partner/.env.example   apps/partner/.env
```

| Variable | Used by |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Console |
| `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Consumer & Partner |

> Only the **publishable / anon** key belongs in `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` — never the secret key (`sb_secret_…`), which bypasses row-level security. `.env` files are gitignored.

## Running

```bash
pnpm console:dev        # Next.js dev → http://localhost:3000
pnpm consumer:start     # Expo QR — scan with Expo Go
pnpm partner:start      # Expo QR — scan with Expo Go
```

For installable device builds, use [EAS Build](https://docs.expo.dev/build/introduction/) via each app's `eas.json` and `pnpm <app>:build:android` / `:ios` scripts.

## Backend

Schema, views, RLS, and Realtime publication live in [`supabase/migrations`](supabase/migrations); demo data in [`supabase/seed.sql`](supabase/seed.sql). All state changes go through Postgres RPCs — never direct table writes from the client:

| RPC | Purpose |
|---|---|
| `book_slot` | Atomic slot lock; inserts booking + parts + deposit payment, deducts the AstraPay wallet |
| `update_booking_status` | Validates the booking state machine; refunds deposit + frees slot on cancel |
| `complete_booking` | Final payment, +5 MotoScore, +500 MotoPoints, resets serviced components |
| `advance_odometer` | Adds km; fires maintenance notifications at 80 / 95 / 100 % thresholds |
| `finish_ride` | Server-side distance recompute, rejects spoofed tracks, awards MotoPoints |

Realtime is published on `bookings`, `motoscore`, `points`, `slots`, `notifications`, and `rides`.

## Conventions

- **TanStack Query** everywhere, with a polling fallback beside every realtime subscription.
- **Plain `StyleSheet`** in React Native · **Tailwind CSS** in the console · shared tokens from `@umotor/shared`.
- **Integer Rupiah** always — render via `formatRp`, never floated.
- **Bahasa Indonesia** for all user-facing copy.

## Demo reset

```bash
pnpm db:reset
```

Re-applies migrations and re-seeds. Seed data is relative to the current date, so it never goes stale — a reset restores the wallet, score, and bookings to their exact demo numbers before every rehearsal.
