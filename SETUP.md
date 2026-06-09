# Tactical COP — Setup Guide

**NOT FOR OPERATIONAL USE — TRAINING / EXERCISE ONLY**

---

## Quick Start (local, no backend)

1. Open `index.html` in a browser (or serve with `npx serve .`)
2. Enter a callsign — works fully offline in local mode
3. Supabase fields are optional; skip them to use the app solo

---

## Phase 0 Backend Setup (Supabase)

### 1. Create a Supabase project
Go to https://supabase.com → New project → choose a region close to your AO.

### 2. Run the schema
Dashboard → SQL Editor → New query → paste `supabase/schema.sql` → Run.

### 3. Configure the app
Edit `js/config.js` — replace the two placeholder values:

```js
const SUPABASE_URL      = 'https://xxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGci...';
```

Both values are in Dashboard → Project Settings → API.

The anon key is safe to commit — it's designed for client-side use and
Postgres RLS controls what each user can actually read or write.

### 4. Enable Realtime
Dashboard → Database → Replication → enable `units`, `graphics`, `messages`.

### 5. Deploy to GitHub Pages
Push to the `main` branch of a GitHub repo, then enable Pages
(Settings → Pages → Source: main / root). The app serves from `/`.

---

## Architecture at a glance

```
Browser (GitHub Pages)
  ├── Leaflet map            – Leaflet 1.9
  ├── MIL symbols            – milsymbol 2.2 (MIL-STD-2525D)
  ├── MGRS grid + readout    – mgrs + proj4js
  └── Supabase JS client
        ├── Auth             – anonymous or magic-link email
        ├── Postgres         – units, graphics (persisted COP)
        └── Realtime         – live sync across mission members
```

---

## Mission workflow

1. Sign in (callsign required; email optional for persistence)
2. Tap **No Mission** chip → **Create Mission** or paste a join code
3. Share the 8-character join code with other members
4. Place units, draw lines/areas — all changes sync live

---

## Phases remaining

| Phase | Feature |
|-------|---------|
| 1 | Live COP — units/graphics sync in real time ✓ (wired, needs Supabase) |
| 2 | Blue Force Tracking — GPS position broadcast |
| 3 | C2 Comms — echelon-aware nets, SITREP/FRAGO/SALUTE |
| 4 | Planning — areas, routes, phase lines, range fans |
| 5 | Terrain — LOS/viewshed, elevation profiles |
| 6 | Triggers — geofenced alerts on phase lines / EAs |
| 7 | AI Assist — NL → graphics, auto-SITREP |
| 8 | Hardening — PWA offline, WebGL rendering, conflict resolution |

---

## MGRS notes

Default AO is **Camp Grayling, MI** — UTM zone 16T, 100 km square **DL**.

Local grids (just digits, e.g. `123456`) are automatically expanded to
`16TDL123456`. Edit `AO.mgrs100k` in `js/config.js` to change the AO.

Full MGRS strings (e.g. `16TDL1234567890`) are always accepted.
