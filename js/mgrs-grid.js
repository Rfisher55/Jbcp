// MGRS grid overlay and coordinate utilities

// ── Coordinate helpers ────────────────────────────────────

function utmProj(zone, north = true) {
  return `+proj=utm +zone=${zone} ${north ? '' : '+south '}+datum=WGS84 +units=m +no_defs`;
}

function lngToZone(lng) {
  return Math.floor((lng + 180) / 6) + 1;
}

function toUTM(lat, lng, zone) {
  return proj4('WGS84', utmProj(zone, lat >= 0), [lng, lat]); // [e, n]
}

function fromUTM(e, n, zone, north = true) {
  return proj4(utmProj(zone, north), 'WGS84', [e, n]); // [lng, lat]
}

// MGRS string for a lat/lng; precision 1–5 (5 = 1m / 10 digits)
function toMGRS(lat, lng, precision = 5) {
  try { return mgrs.forward([lng, lat], precision); } catch { return null; }
}

// Parse MGRS or local grid string → { lat, lng, valid, note }
function parseMGRS(raw) {
  const s = raw.replace(/\s+/g, '').toUpperCase();

  // Try full MGRS
  try {
    const [lng, lat] = mgrs.toPoint(s);
    if (isFinite(lat) && isFinite(lng)) return { lat, lng, valid: true };
  } catch {}

  // Try abbreviated numeric grid — assume AO 100km square
  if (/^\d{4,10}$/.test(s) && s.length % 2 === 0) {
    const h = s.length / 2;
    const e = s.slice(0, h).padEnd(5, '0');
    const n = s.slice(h).padEnd(5, '0');
    const full = AO.mgrs100k + e + n;
    try {
      const [lng, lat] = mgrs.toPoint(full);
      if (isFinite(lat) && isFinite(lng))
        return { lat, lng, valid: true, note: `Expanded to ${full}` };
    } catch {}
  }

  return { valid: false };
}

// ── MGRS Grid Layer ───────────────────────────────────────

const MGRSGrid = L.Layer.extend({
  _canvas: null,
  _vis: true,

  onAdd(map) {
    this._map = map;
    this._canvas = L.DomUtil.create('canvas', 'mgrs-canvas');
    map.getPane('overlayPane').appendChild(this._canvas);
    map.on('viewreset moveend zoomend resize', this._draw, this);
    this._draw();
  },

  onRemove(map) {
    this._canvas.remove();
    map.off('viewreset moveend zoomend resize', this._draw, this);
  },

  show() { this._vis = true;  this._draw(); },
  hide() { this._vis = false; if (this._canvas) this._canvas.style.display = 'none'; },

  _draw() {
    if (!this._vis) return;
    const map = this._map;
    const sz  = map.getSize();
    const c   = this._canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);

    c.style.display = '';
    // Physical pixel dimensions — prevents blurry upscaled lines on Retina/HiDPI
    c.width  = Math.round(sz.x * dpr);
    c.height = Math.round(sz.y * dpr);
    c.style.width  = sz.x + 'px';
    c.style.height = sz.y + 'px';

    // Align canvas with Leaflet pane
    const tl = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(c, tl);

    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // scale once; canvas reset clears old transform
    ctx.clearRect(0, 0, sz.x, sz.y);

    const zoom   = map.getZoom();
    const bounds = map.getBounds();

    // Grid interval and label precision by zoom level
    let interval, digits;
    if      (zoom < 8)  { interval = 100000; digits = 0; }
    else if (zoom < 10) { interval = 10000;  digits = 1; }
    else if (zoom < 13) { interval = 1000;   digits = 2; }
    else if (zoom < 15) { interval = 100;    digits = 3; }
    else                { interval = 10;     digits = 4; }

    // Which UTM zones are visible?
    const zones = new Set();
    const w = bounds.getWest(), e = bounds.getEast();
    for (let lng = Math.floor(w / 6) * 6; lng <= e; lng += 6)
      zones.add(lngToZone(lng));
    zones.add(lngToZone(w));
    zones.add(lngToZone(e));

    for (const z of zones) this._drawZone(ctx, map, bounds, z, interval, digits);
  },

  _drawZone(ctx, map, bounds, zone, interval, digits) {
    const zW = (zone - 1) * 6 - 180;
    const zE = zone * 6 - 180;
    const latS = Math.max(bounds.getSouth(), -80);
    const latN = Math.min(bounds.getNorth(),  84);
    const lngW = Math.max(bounds.getWest(),  zW);
    const lngE = Math.min(bounds.getEast(),  zE);
    if (lngW >= lngE) return;

    const isN = latS >= 0;

    let eSW, nSW, eNE, nNE, eNW, eSE;
    try {
      [eSW, nSW] = toUTM(latS, lngW, zone);
      [eNE, nNE] = toUTM(latN, lngE, zone);
      [eNW]      = toUTM(latN, lngW, zone);
      [eSE]      = toUTM(latS, lngE, zone);
    } catch { return; }

    const eMin = Math.floor(Math.min(eSW, eNW) / interval) * interval;
    const eMax = Math.ceil( Math.max(eNE, eSE) / interval) * interval;
    const nMin = Math.floor(nSW / interval) * interval;
    const nMax = Math.ceil( nNE / interval) * interval;

    const zoom = this._map.getZoom();
    ctx.strokeStyle = 'rgba(0,160,220,0.35)';
    ctx.lineWidth   = zoom >= 13 ? 0.4 : 0.6;
    ctx.font        = `${zoom >= 12 ? 9 : 8}px 'SF Mono',monospace`;
    ctx.fillStyle   = 'rgba(0,170,230,0.7)';

    for (let e = eMin; e <= eMax; e += interval) {
      if (e < 100000 || e > 900000) continue;
      this._line(ctx, map, zone, isN, 'e', e, nMin, nMax, digits);
    }
    for (let n = nMin; n <= nMax; n += interval) {
      if (n < 0 || n > 10000000) continue;
      this._line(ctx, map, zone, isN, 'n', n, eMin, eMax, digits);
    }
  },

  _line(ctx, map, zone, isN, axis, fixed, vMin, vMax, digits) {
    const steps = Math.max(5, 20);
    const pts   = [];

    for (let i = 0; i <= steps; i++) {
      const v = vMin + (vMax - vMin) * (i / steps);
      try {
        const [lng, lat] = axis === 'e'
          ? fromUTM(fixed, v, zone, isN)
          : fromUTM(v, fixed, zone, isN);
        if (!isFinite(lat) || !isFinite(lng)) continue;
        pts.push(map.latLngToContainerPoint([lat, lng]));
      } catch {}
    }

    if (pts.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();

    // Label at midpoint if it's inside the canvas
    if (digits > 0) {
      const mid  = pts[Math.floor(pts.length / 2)];
      const size = map.getSize();
      if (mid.x > 16 && mid.x < size.x - 16 && mid.y > 16 && mid.y < size.y - 16) {
        const raw = Math.round(fixed);
        const label = String(raw).slice(-digits * 2 + (digits === 1 ? 1 : 0)).padStart(digits * 2, '0').slice(0, digits);
        ctx.save();
        ctx.font = '9px SF Mono,monospace';
        ctx.fillStyle = 'rgba(70,210,255,0.8)';
        ctx.fillText(label, mid.x + 2, mid.y - 2);
        ctx.restore();
      }
    }
  }
});

function createMGRSGrid() { return new MGRSGrid(); }
