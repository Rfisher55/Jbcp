// ── Supabase ──────────────────────────────────────────────
// Replace with your project values from:
// https://supabase.com/dashboard/project/_/settings/api
const SUPABASE_URL      = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// ── Default AO: Camp Grayling, MI ────────────────────────
const AO = {
  name:    'Camp Grayling',
  center:  [44.63444, -84.77250],
  zoom:    13,
  gzd:     '16T',
  utmZone: 16,
  // Approximate AO 100km square for local grid expansion
  mgrs100k: '16TDL',
};

// ── Timing ───────────────────────────────────────────────
const CFG = {
  positionInterval:  12000,  // ms between GPS broadcasts
  positionThreshold: 25,     // meters before on-move publish
  staleAfter:        60000,  // ms to fade a silent track
};
