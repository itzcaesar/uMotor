# uMotor — Implementation Status

> Snapshot as of 2026-06-12 (commit `d6e12b2`). Tracks what is built, what was fixed along the way, and what remains from the PRDs (`00`–`03`).

---

## 1. Implemented

### 1.1 Foundation & Data Layer (M0)

| Item | Status | Notes |
|---|---|---|
| pnpm workspaces monorepo | ✅ | `apps/console`, `apps/consumer`, `apps/partner`, `packages/shared`, `supabase/` |
| Supabase schema (`supabase/migrations/0001_init.sql`) | ✅ | All tables incl. `spareparts.install_fee` + seller `workshop_id`; `component_health` view; Realtime publication on bookings, motoscore, points, slots, notifications |
| RLS | ✅ | Enabled on all tables, permissive `using (true)` anon policies (fake-auth by design) |
| 4 Postgres RPCs | ✅ | `book_slot` (atomic slot lock, raises `slot_full`), `update_booking_status` (validates state machine, refunds on cancel), `complete_booking` (final payment, +5 MotoScore, +500 points, component reset, notification), `advance_odometer` (80/95/100% threshold notifications) |
| Seed data (`supabase/seed.sql`) | ✅ | Date-relative (never stales); demo-exact numbers: Vario 160 `D 4821 BJK` at 2.400/3.000 km oil (80%), deposit Rp 25.000, total Rp 83.000, MotoScore 720; spareparts with sellers + install fees |
| `@umotor/shared` package | ✅ | Fixed demo UUIDs, types, `formatRp`, design tokens, `COMPONENT_LABELS`/`STATUS_LABELS` (ID), mocks: `payAstraPay` (1.5s, never fails), `samsatLookup`, `estimateOdometer`, `computeMotoScore` |
| Fake auth | ✅ | zustand session stores set `DEMO_USER_ID` / `DEMO_WORKSHOP_ID`; no real Supabase Auth (deliberate) |

### 1.2 Console (web, `apps/console`) — PRD 03

| Screen | Status | Notes |
|---|---|---|
| Dashboard (`/`) | ✅ | KPI cards (icons, trends, live dot), charts (Recharts), realtime KPI tick on booking insert |
| Bookings (`/bookings`) | ✅ | TanStack Table list with status pills |
| Workshops (`/workshops`) | ✅ | Partner list |
| Polish | ✅ | KpiCard, ChartTooltip, Pill, topbar, custom globals.css (user-authored) |

### 1.3 Consumer app (`apps/consumer`) — PRD 01

| Feature | Status | Notes |
|---|---|---|
| Garasi (home tab) | ✅ | Bike cards with component health bars (<80 green, 80–94 warning, ≥95 danger) |
| Bike detail (`bike/[id]`) | ✅ | Component health breakdown, service history |
| Add bike (modal) | ✅ | `samsatLookup` plate autofill, default component intervals (oil 3000, tire 20000, battery 15000, brake_pad 12000, air_filter 16000) |
| Booking flow | ✅ | `booking/new` (workshop list, Semua/AHASS/Home-service filters, featured rail) → `workshop/[id]` (service picker, 7-day strip, slot grid with live "penuh", realtime slot updates) → `confirm` (part recommendations by service + compatible model, AstraPay deposit, `book_slot` RPC, `slot_full` handling) |
| Booking status (`booking/[id]`) | ✅ | 4-step stepper, QR code (`qr_token`), realtime status; completion celebration modal with MotoScore count-up (720→725) + 500 MotoPoints badge |
| Bookings tab | ✅ | Active + history list |
| MotoScore (`motoscore`) | ✅ | SVG half-circle gauge with bands (Kurang/Cukup/Baik/Sangat Baik), score-gated product offers (pinjaman 650, asuransi 600, cicilan 0% 700), history, realtime |
| Marketplace tab + cart | ✅ | Seller display, install fees, ship/install delivery modes, recommendation rail from ≥80% components (user-authored) |
| Finance Hub tab | ✅ | Monthly spend, bills with due-date urgency + pay flow, **fuel top-up → organic odometer** (`liters × avg_kml` → `advance_odometer` RPC — the Modul 5 pitch moment) |
| Demo controls (long-press profile name) | ✅ | +500 km, fire oil notification (exact pitch copy), reset wallet to 500.000, mark notifications read, Supabase config indicator |
| Notifications | ✅ | In-app list, unread badge (no push — see §3) |

### 1.4 Partner app (`apps/partner`) — PRD 02

| Feature | Status | Notes |
|---|---|---|
| Inbox tab | ✅ | New bookings, app-level realtime sub (buzz fires on any tab), success haptic on insert |
| Antrian (queue) tab | ✅ | Today's confirmed/checked-in/in-progress, sorted by slot time |
| Booking detail | ✅ | One primary action per state: Terima → Check-in (Scan QR) → Selesaikan servis (shows remaining bill); Tolak with deposit-refund warning |
| QR scan (`scan`, modal) | ✅ | Real camera (expo-camera), validates token + workshop + status with distinct errors, success haptic, auto-back; "Simulasi scan" fallback button for rehearsed path |
| Pendapatan (earnings) tab | ✅ | Today's net (bruto − 5% simulated platform fee), H+1 settlement note, last 10 completions, live refresh |

### 1.5 Verification

- `tsc --noEmit` clean on all three apps.
- `expo export --platform web` smoke bundle green for consumer + partner.

---

## 2. Fixed

| Fix | Detail |
|---|---|
| Queue showed wrong day | Filtered by `created_at`; bookings made yesterday for today's slot never appeared. Now filters by **slot date** (home service counts as today), sorted by slot time |
| `gen_random_bytes` missing on hosted reset | pgcrypto not available → `qr_token` default switched to `md5(random() \|\| clock_timestamp())` (commit `90c1658`) |
| `create-next-app console` refused | "console is a core module name" → scaffolded under temp name, renamed folder, package `@umotor/console` |
| pnpm blocked build scripts | `sharp`, `unrs-resolver` allowed in `pnpm-workspace.yaml` |
| Stale Expo typed routes | `.expo/types/router.d.ts` from `expo start` contained bogus paths → deleted (regenerates; tsc falls back to loose `Href`) |
| Corrupted `@expo/cli` pnpm link | ENOENT on `expoSsoLauncher.js` → resolved after `pnpm install` retry |
| Card `style` prop rejected arrays | `ViewStyle` → `StyleProp<ViewStyle>` |

---

## 3. Not Implemented (PRD gaps)

Ordered by demo value, highest first.

| Feature | PRD | Notes |
|---|---|---|
| Home-service booking flow with GPS pin | 01 §booking | `is_home_service` + `home_address` exist in schema and render in partner detail, but consumer has no UI to create one |
| Cart "install" mode → installation booking | 01 §marketplace | Currently records payment only; PRD says it should create a booking at the seller workshop |
| Partner sparepart orders tab | 02 | Incoming marketplace orders for seller workshops |
| Partner slot/capacity config | 02 | Slots are seed-only; no UI to open/close slots or adjust capacity |
| Console: users page, revenue donut, workshop map | 03 | Dashboard + bookings + workshops exist; rest of console nav is stubs |
| MotoCommunity static feed | 01 (nice-to-have) | Pitch deck Modul; pure static screen, low effort |
| Local push notifications (expo-notifications) | 01 | Notifications are in-app only; no OS-level push |
| Real auth (Supabase Auth) | All | Deliberately out of scope for demo — fake sessions with fixed UUIDs |
| NativeWind migration | — | Declined: plain StyleSheet chosen for zero config risk before demo day |

---

## 4. Operational reminders

- **`pnpm db:reset` required** to apply the seller/`install_fee` schema + new seed (if not already run).
- `.expo/types/router.d.ts` goes stale after `expo start` — safe to delete if tsc complains about routes.
- Console env: only the publishable/anon key in `NEXT_PUBLIC_*`. **Never** the secret key (`sb_secret_`) — it bypasses RLS and `NEXT_PUBLIC_*` is exposed to the browser.
- Demo rehearsal fallback: partner check-in has "Simulasi scan" when camera/QR fails on stage.
