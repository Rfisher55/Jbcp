// Blue Force Tracking — live GPS broadcasting and track display
const BFT = {
  _channel:   null,
  _tracks:    {},    // uid → { callsign, lat, lng, heading, speed, mgrs, ts, hist, histPoly, stale, marker }
  _layer:     null,
  _histLayer: null,

  STALE_MS:    3 * 60 * 1000,
  HISTORY_MAX: 8,

  init(map) {
    this._layer     = L.featureGroup().addTo(map);
    this._histLayer = L.featureGroup().addTo(map);
    this._histLayer.bringToBack();
    setInterval(() => this._checkStale(), 20000);
  },

  joinMission(missionId) {
    this.leaveMission();
    if (!DB.online) return;

    this._channel = DB.client.channel(`bft:${missionId}`, {
      config: { broadcast: { self: false } }
    });

    this._channel.on('broadcast', { event: 'pos' }, ({ payload }) => {
      this._updateTrack(payload);
    });

    this._channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') UI.toast('BFT: Live tracking active', 'success', 2000);
    });
  },

  leaveMission() {
    if (this._channel) {
      try { DB.client.removeChannel(this._channel); } catch {}
      this._channel = null;
    }
    this._clearTracks();
  },

  broadcast(lat, lng, heading, speed, status = {}) {
    if (!this._channel) return;
    try {
      this._channel.send({
        type: 'broadcast',
        event: 'pos',
        payload: {
          uid:      Auth.user?.id || ('anon-' + Auth.callsign),
          callsign: Auth.callsign || 'Unknown',
          lat, lng,
          heading:  Math.round(heading || 0),
          speed:    Math.round((speed || 0) * 3.6),
          mgrs:     toMGRS(lat, lng, 5) || '',
          ts:       Date.now(),
          fuel_pct: status.fuel_pct ?? null,
          ammo_pct: status.ammo_pct ?? null,
          opstat:   status.opstat   || null,
        }
      });
    } catch {}
  },

  _updateTrack(data) {
    if (!data?.uid) return;
    const uid = data.uid;
    const ex  = this._tracks[uid];

    if (ex) {
      if (Math.abs(ex.lat - data.lat) > 1e-5 || Math.abs(ex.lng - data.lng) > 1e-5) {
        ex.hist.push([ex.lat, ex.lng]);
        if (ex.hist.length > this.HISTORY_MAX) ex.hist.shift();
        this._drawHistory(uid);
      }
      Object.assign(ex, data, { hist: ex.hist, histPoly: ex.histPoly, stale: false });
      ex.marker.setLatLng([data.lat, data.lng]);
      this._refreshIcon(uid, false);
    } else {
      const marker = this._makeMarker(data);
      this._tracks[uid] = { ...data, hist: [], histPoly: null, stale: false, marker };
    }
  },

  _makeMarker(data) {
    const marker = L.marker([data.lat, data.lng], {
      icon:         this._icon(data, false),
      zIndexOffset: 500,
      interactive:  true,
    });
    marker.on('click', () => this._showCard(data.uid));
    marker.addTo(this._layer);
    return marker;
  },

  _icon(data, stale) {
    const init    = (data.callsign || '??').slice(0, 2).toUpperCase();
    const hdg     = data.heading || 0;
    const moving  = (data.speed || 0) > 1;
    const arrow   = `<svg class="bft-hdg-arrow${moving ? '' : ' bft-hdg-hidden'}" ` +
                    `style="transform:rotate(${hdg}deg)" viewBox="0 0 10 10" width="10" height="10">` +
                    `<polygon points="5,0 10,10 5,7 0,10"/></svg>`;
    return L.divIcon({
      html:       `<div class="bft-wrap${stale ? ' bft-stale' : ''}">` +
                  `<div class="bft-dot">${arrow}<span>${_escH(init)}</span></div>` +
                  `<div class="bft-cs">${_escH(data.callsign || '')}</div></div>`,
      className:  '',
      iconSize:   [52, 48],
      iconAnchor: [26, 24],
    });
  },

  _refreshIcon(uid, stale) {
    const t = this._tracks[uid];
    if (t) t.marker.setIcon(this._icon(t, stale));
  },

  _drawHistory(uid) {
    const t = this._tracks[uid];
    if (!t?.hist.length) return;
    if (t.histPoly) this._histLayer.removeLayer(t.histPoly);
    t.histPoly = L.polyline(t.hist, {
      color:       '#58a6ff',
      weight:      1.5,
      opacity:     0.35,
      dashArray:   '2,6',
      interactive: false,
    }).addTo(this._histLayer);
  },

  _checkStale() {
    const now = Date.now();
    Object.entries(this._tracks).forEach(([uid, t]) => {
      const stale = (now - t.ts) > this.STALE_MS;
      if (stale !== t.stale) {
        t.stale = stale;
        this._refreshIcon(uid, stale);
      }
    });
  },

  _showCard(uid) {
    const t = this._tracks[uid];
    if (!t) return;
    const age  = Math.round((Date.now() - t.ts) / 1000);
    const ages = age > 120 ? Math.floor(age / 60) + 'm ago' : age + 's ago';

    document.getElementById('bft-card-cs').textContent    = t.callsign || 'Unknown';
    document.getElementById('bft-card-mgrs').textContent  = t.mgrs     || '—';
    document.getElementById('bft-card-hdg').textContent   = t.heading  ? t.heading + '°' : '—';
    document.getElementById('bft-card-spd').textContent   = t.speed    ? t.speed + ' kph' : '—';
    document.getElementById('bft-card-age').textContent   = ages;

    const stale = document.getElementById('bft-card-stale');
    stale.textContent = t.stale ? 'STALE' : 'LIVE';
    stale.className   = 'bft-status-badge ' + (t.stale ? 'stale' : 'live');

    // Bearing/distance from own GPS position
    const fromDt  = document.getElementById('bft-card-from-dt');
    const fromEl  = document.getElementById('bft-card-from');
    const selfPos = (typeof App !== 'undefined') ? App._selfPos : null;
    if (selfPos && fromEl) {
      const dx = (t.lng - selfPos.lng) * Math.cos(selfPos.lat * Math.PI / 180) * 111320;
      const dy = (t.lat - selfPos.lat) * 111320;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const az   = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
      const distStr = dist >= 1000 ? (dist / 1000).toFixed(1) + ' km' : Math.round(dist) + ' m';
      fromEl.textContent = `${distStr} at ${az.toFixed(0)}° (${Math.round(az * 6400 / 360)} mil)`;
      if (fromDt) fromDt.style.display = '';
      fromEl.style.display = '';
    } else {
      if (fromDt) fromDt.style.display = 'none';
      if (fromEl) fromEl.style.display = 'none';
    }

    const _rowVis = (dtId, ddId, show) => {
      const dt = document.getElementById(dtId);
      const dd = document.getElementById(ddId);
      if (dt) dt.style.display = show ? '' : 'none';
      if (dd) dd.style.display = show ? '' : 'none';
    };
    _rowVis('bft-card-fuel-row', 'bft-card-fuel', t.fuel_pct != null);
    _rowVis('bft-card-ammo-row', 'bft-card-ammo', t.ammo_pct != null);
    _rowVis('bft-card-stat-row', 'bft-card-opstat', t.opstat != null);
    const fuelEl = document.getElementById('bft-card-fuel');
    const ammoEl = document.getElementById('bft-card-ammo');
    const statEl = document.getElementById('bft-card-opstat');
    if (fuelEl && t.fuel_pct != null) fuelEl.textContent = t.fuel_pct + '%';
    if (ammoEl && t.ammo_pct != null) ammoEl.textContent = t.ammo_pct + '%';
    if (statEl && t.opstat)           statEl.textContent = t.opstat;

    // Fly-to and share buttons
    const flyBtn   = document.getElementById('btn-bft-fly');
    const shareBtn = document.getElementById('btn-bft-share-pos');
    if (flyBtn) {
      flyBtn.onclick = () => {
        UI.closeSheet('sheet-bft-card');
        MapCtrl.flyToGrid(t.lat, t.lng);
      };
    }
    if (shareBtn) {
      shareBtn.onclick = () => {
        if (!Chat.isJoined()) { UI.toast('Join a mission to share', 'info'); return; }
        const cs = String(t.callsign || 'Track').replace(/[|\x00-\x1f]/g, '').slice(0, 16);
        Chat.send(`BFT TRACK: ${cs} @ ${t.mgrs || `${t.lat.toFixed(5)},${t.lng.toFixed(5)}`} HDG ${t.heading || 0}° ${t.speed || 0}kph`);
        UI.closeSheet('sheet-bft-card');
        UI.toast('Position shared to chat', 'success', 2000);
      };
    }

    UI.showSheet('sheet-bft-card');
  },

  _clearTracks() {
    Object.values(this._tracks).forEach(t => {
      if (t.marker)   this._layer.removeLayer(t.marker);
      if (t.histPoly) this._histLayer.removeLayer(t.histPoly);
    });
    this._tracks = {};
  },

  count() { return Object.keys(this._tracks).length; }
};

function _escH(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
