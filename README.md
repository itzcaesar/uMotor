# uMotor — Prototype Monorepo

Platform manajemen motor berbasis AstraPay. **Demo/prototype only** — see `docs/` for PRDs.

## Layout

| Path | What |
|---|---|
| `apps/console` | Next.js ops dashboard (docs/03) — **built** |
| `apps/consumer` | Expo rider app (docs/01) — not started |
| `apps/partner` | Expo workshop app (docs/02) — not started |
| `packages/shared` | Types, constants, theme, mock services |
| `supabase/` | Migration (schema + views + RPCs) and seed |
| `docs/` | Proposal PDF + PRDs (`00` = shared architecture) |

## Setup

1. `pnpm install`
2. Create a **hosted** Supabase project (phones + projector must reach it).
3. Install the Supabase CLI, then:
   ```
   supabase init        # once, generates supabase/config.toml (gitignored ok)
   supabase link --project-ref <YOUR_PROJECT_REF>
   supabase db reset --linked   # runs migration + seed; rerun before every rehearsal
   ```
4. `cp apps/console/.env.example apps/console/.env.local` and fill URL + anon key.
5. `pnpm console:dev` → http://localhost:3000

## Demo reset

`pnpm db:reset` (alias for `supabase db reset --linked`). Seeds are relative to `current_date`, never stale.
