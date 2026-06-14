# uMotor

**Platform manajemen motor berbasis AstraPay** — a motorcycle-ownership platform built around AstraPay payments. Riders manage their bikes, book workshop service, track rides, and unlock financing from their maintenance behaviour; workshops manage their queue and earnings; ops monitor everything from a web console.

> ⚠️ **Prototype.** This is a demo build — no real authentication, permissive row-level security, and mocked payments. Not production-ready by design.

## Apps

| App | Path | Stack | Audience |
|---|---|---|---|
| **Consumer** | `apps/consumer` | Expo + Expo Router (React Native, iOS/Android) | Rider — garage, bookings, MotoScore, marketplace, finance, community, ride tracking |
| **Partner** | `apps/partner` | Expo + Expo Router (React Native, phone & tablet) | Workshop — inbox, queue, QR check-in, earnings, slots, sparepart orders |
| **Console** | `apps/console` | Next.js (App Router) + Recharts + TanStack Table | Ops/admin web dashboard |
| **Shared** | `packages/shared` | TypeScript library (`@umotor/shared`) | Types, constants, theme, Supabase factory, mock services |
| **Backend** | `supabase/` | Postgres migrations + seed | Schema, views, RPCs, RLS, Realtime |

All three front-ends talk to a single hosted Supabase project over the internet.

## Highlights

- **MotoScore** — a credit-style score derived from maintenance behaviour that unlocks financing (loans, insurance, 0% installments).
- **Booking flow** — workshop discovery, live slot locking, AstraPay deposit, QR check-in, completion celebration.
- **Ride tracking** — foreground GPS + sensor-based activity classification with a server-side trust boundary that recomputes distance and rejects spoofed tracks, then advances the odometer and awards points.
- **Finance Hub** — bill payments (STNK/installments) and fuel top-up that organically advances the odometer.
- **Partner ops** — realtime booking inbox, queue, earnings, slot/capacity config, and a sparepart marketplace — tablet-aware layouts.

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS) and [pnpm](https://pnpm.io/)
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- A hosted Supabase project (phones and the projector must be able to reach it)
- [Expo Go](https://expo.dev/go) on the phones used for the mobile apps

## Setup

```bash
pnpm install
```

Provision the backend:

```bash
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>
supabase db reset --linked     # applies migrations + seed
```

Configure environment variables — copy each `.env.example` and fill in your Supabase URL and **publishable/anon** key:

```bash
cp apps/console/.env.example   apps/console/.env.local
cp apps/consumer/.env.example  apps/consumer/.env
cp apps/partner/.env.example   apps/partner/.env
```

| Variable | Used by |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Console |
| `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Consumer & Partner |

> 🔒 Only the **publishable/anon** key (`sb_publishable_…` or legacy `eyJ…`) belongs in `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` — these are exposed to the client. Never put the secret key (`sb_secret_…`) there; it bypasses row-level security. `.env` files are gitignored.

## Running

```bash
pnpm console:dev       # Next.js dev server → http://localhost:3000
pnpm consumer:start    # Expo dev server — scan the QR with Expo Go
pnpm partner:start     # Expo dev server — scan the QR with Expo Go
```

Production / smoke builds:

```bash
pnpm console:build                          # next build
cd apps/consumer && npx expo export --platform web
cd apps/partner  && npx expo export --platform web
```

Typecheck (no test suite):

```bash
cd apps/console && npx tsc --noEmit
npx tsc -p apps/consumer/tsconfig.json --noEmit
npx tsc -p apps/partner/tsconfig.json --noEmit
```

## Backend

The schema, views, row-level-security policies, and Realtime publication live in `supabase/migrations`; demo data lives in `supabase/seed.sql`. All stateful work goes through Postgres RPCs rather than direct table writes from the client:

| RPC | Purpose |
|---|---|
| `book_slot` | Atomic slot lock; inserts booking + parts + deposit payment, deducts the AstraPay wallet (`null` slot ⇒ home service) |
| `update_booking_status` | Validates the booking state machine; refunds the deposit and frees the slot on cancel |
| `complete_booking` | Final payment, awards MotoScore + MotoPoints, resets serviced components |
| `advance_odometer` | Adds distance and fires maintenance notifications when wear thresholds are crossed |
| `finish_ride` | Recomputes ride distance server-side, rejects spoofed tracks, then advances the odometer and awards points |

Realtime is published on `bookings`, `motoscore`, `points`, `slots`, `notifications`, and `rides`.

## Conventions

- **Data fetching:** TanStack Query everywhere, with a polling fallback alongside every realtime subscription so a dropped websocket never freezes a flow.
- **Styling:** plain `StyleSheet` in React Native; Tailwind CSS in the console. Shared design tokens come from `@umotor/shared`.
- **Money** is integer Rupiah — always rendered via `formatRp`, never floated.
- **UI copy** is in Bahasa Indonesia.

## Demo reset

```bash
pnpm db:reset
```

Re-applies migrations and re-seeds. Seed data is relative to the current date, so it never goes stale; a reset restores the wallet, score, and bookings to their exact demo numbers before each rehearsal.
