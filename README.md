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
- *(optional, for installable device builds)* [EAS CLI](https://docs.expo.dev/build/setup/) (`npm i -g eas-cli`) and a free [Expo account](https://expo.dev/signup)

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

## Build for your phone (EAS)

Expo Go (above) is the fastest way to try the apps, but the native modules — camera QR check-in (partner) and location/motion sensors for ride tracking (consumer) — are best exercised in a **standalone build**. Both mobile apps ship an [EAS Build](https://docs.expo.dev/build/introduction/) config (`apps/consumer/eas.json`, `apps/partner/eas.json`) so you can install a real, self-contained app on your own device.

**One-time setup:**

```bash
npm install -g eas-cli      # or prefix every command with: pnpm dlx eas-cli@latest …
eas login                   # free Expo account

# Link each app to an EAS project (writes extra.eas.projectId into app.json):
cd apps/consumer && eas init
cd ../partner    && eas init
```

**Build & install — Android (easiest, no paid account):**

```bash
pnpm consumer:build:android     # uploads to EAS, prints a QR + install URL
pnpm partner:build:android
```

EAS builds in the cloud and prints a link with a QR code. On the phone, open it, download the `.apk`, and install it (allow "install unknown apps" once). The `preview` profile produces a sideloadable APK — no Play Store needed.

**iOS** needs an Apple Developer account to sign for a physical device. Register the phone once, then build:

```bash
eas device:create               # open the link on the iPhone to register it
pnpm consumer:build:ios
pnpm partner:build:ios
```

**Build profiles** (defined in each `eas.json`):

| Profile | Command | Use |
|---|---|---|
| `preview` | `pnpm <app>:build:android` / `:ios` | Standalone test build for your phone (APK on Android) |
| `development` | `cd apps/<app> && pnpm eas:build:dev` | Dev client — install once, then `pnpm <app>:start` for live reload |
| `production` | `cd apps/<app> && pnpm eas:build:prod` | Store-ready build (Android AAB), auto-incrementing version |

> 🔒 The publishable Supabase URL + anon key are baked into each `eas.json` under `build.<profile>.env` so the cloud build can reach the backend — these are the same client-safe values that already ship inside the JS bundle. **Never** put the secret key (`sb_secret_…`) there. Prefer no keys in git? Delete the `env` blocks and run `eas env:push` to store them on EAS instead.

EAS detects the pnpm workspace automatically — run the `pnpm <app>:build:*` scripts from the repo root, or `cd apps/<app>` and use the `eas:build*` scripts directly.

## Build locally (skip the EAS queue)

EAS builds in the cloud, which means waiting in a queue. If you have the native toolchains installed you can compile on your own machine instead — much faster on repeat builds.

| Target | Local build on… | Notes |
|---|---|---|
| **Android** | macOS, Linux, **Windows** | Needs a JDK (17) + the Android SDK (install [Android Studio](https://developer.android.com/studio)). |
| **iOS** | **macOS only** | Needs Xcode. Not possible on Windows/Linux — use EAS for iOS. |

> ⚠️ `eas build --local` is **not supported on Windows** (macOS/Linux only). On Windows, use the `expo run:android` path below — it compiles with your local Android SDK directly.

**One-time setup (Android):** install Android Studio, then make sure `JAVA_HOME` and `ANDROID_HOME` point at your JDK and SDK (the Android Studio installer sets these up). Verify with `adb --version` and `java -version`.

**Build & install on a plugged-in phone** (USB debugging on, or an emulator running):

```bash
pnpm consumer:local:android     # = expo run:android --variant release
pnpm partner:local:android
```

This generates the native `android/` project (via `expo prebuild`), compiles a release APK with Gradle, and installs it on the connected device. The first run downloads Gradle + dependencies (slow, several minutes); later runs are incrementally cached and much faster. Unlike EAS, local builds read `EXPO_PUBLIC_*` straight from each app's `.env` — no extra config.

**Just want the APK file** (to AirDrop/transfer to a phone — no cable needed):

```bash
cd apps/consumer            # or apps/partner
pnpm prebuild               # generates android/  (first time only)
cd android && ./gradlew assembleRelease
# → app/build/outputs/apk/release/app-release.apk
```

Variants: drop `--variant release` (i.e. `pnpm <app>:local:android:dev`) for a debug build with fast reload via `pnpm <app>:start`. The release APK is signed with the auto-generated debug keystore — perfect for sideloading onto your own phone, but you'll need a real upload key to publish to the Play Store (see [Expo: release build locally](https://docs.expo.dev/guides/local-app-production/)).

> The generated `android/` (and `ios/`) folders are gitignored — they're regenerated on demand from `app.json` (Continuous Native Generation), so you never commit them. Delete them anytime; the next build recreates them.


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
