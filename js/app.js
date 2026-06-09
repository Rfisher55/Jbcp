const UI = {
  toast(msg, type = 'info', duration = 3000) {
    const el = document.createElement('div');
    el.className = `toast ${type}`; el.textContent = msg;
    document.getElementById('toasts').appendChild(el);
    setTimeout(() => el.remove(), duration);
  },
  showSheet(id) { document.getElementById(id)?.classList.remove('hidden'); },
  closeSheet(id) { document.getElementById(id)?.classList.add('hidden'); },
  closeAllSheets() { document.querySelectorAll('.sheet:not(#sheet-auth)').forEach(s => s.classList.add('hidden')); },
  toolBtn(tool) { document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === tool)); },
  setMissionLabel(name) { document.getElementById('mission-chip-label').textContent = name || 'No Mission'; },

  updateRoster(state) {
    const list = document.getElementById('roster-list');
    const members = Object.values(state).flat();
    if (!members.length) { list.innerHTML = '<p class="empty-msg">No members online</p>'; return; }
    list.innerHTML = members.map(m => `<div class="roster-item"><div class="roster-avatar">${(m.callsign||'?').slice(0,2)}</div><div class="roster-info"><div class="roster-callsign">${m.callsign||'Unknown'}</div><div class="roster-pos">${m.mgrs||''}</div></div><div class="roster-dot online"></div></div>`).join('');
  },

  buildSymbolGrid(filter = 'F', echelon = '') {
    const grid = document.getElementById('symbol-grid');
    grid.innerHTML = '';
    CATALOG.filter(c => c.cat === filter).forEach(entry => {
      const sidc = buildSIDC(entry.base, echelon);
      const div = document.createElement('div');
      div.className = 'symbol-item'; div.title = entry.name;
      div.appendChild(catalogIcon(sidc, 38));
      const label = document.createElement('span'); label.textContent = entry.name;
      div.appendChild(label);
      div.addEventListener('click', () => { MapCtrl.placeUnit(entry, echelon); UI.closeSheet('sheet-symbols'); });
      grid.appendChild(div);
    });
  },

  showUnitDetail(unit, { onEdit, onDelete }) {
    const sym = new ms.Symbol(unit.sidc || 'SFGPUC-----', { size: 50 });
    const mgrsStr = toMGRS(unit.lat, unit.lng, 5) || `${unit.lat.toFixed(5)}, ${unit.lng.toFixed(5)}`;
    document.getElementById('unit-detail-content').innerHTML = `
      <div class="unit-header"><img src="${sym.toDataURL()}" alt="unit symbol"><div><div class="unit-title">${unit.callsign||'Unit'}</div><div class="unit-meta">${unit.sidc}</div></div></div>
      <dl class="detail-dl"><dt>MGRS</dt><dd>${mgrsStr}</dd><dt>Lat / Lng</dt><dd>${unit.lat.toFixed(5)}, ${unit.lng.toFixed(5)}</dd><dt>Last updated</dt><dd>${unit.updated_at?new Date(unit.updated_at).toLocaleTimeString():'—'}</dd></dl>
      <div class="btn-row"><button class="btn-secondary" id="btn-unit-edit">Edit</button><button class="btn-secondary btn-danger" id="btn-unit-delete">Delete</button></div>`;
    document.getElementById('btn-unit-edit').addEventListener('click', () => {
      const cs = prompt('Callsign:', unit.callsign);
      if (cs !== null) onEdit({ callsign: cs.trim() || unit.callsign });
    });
    document.getElementById('btn-unit-delete').addEventListener('click', () => { if (confirm(`Delete "${unit.callsign}"?`)) onDelete(); });
    this.showSheet('sheet-unit');
  },

  showMissionSheet(missions = []) {
    const c = document.getElementById('mission-content');
    c.innerHTML = `<h3>Mission</h3>
      ${Mission.active ? `<div class="mission-card" style="border-color:rgba(63,185,80,0.4)"><div class="mission-card-info"><div class="mission-card-name">${Mission.current.name}</div><div class="mission-card-meta">Code: ${Mission.current.id.slice(0,8).toUpperCase()}</div></div><span class="badge">Active</span></div><div class="btn-row" style="margin-bottom:16px"><button class="btn-secondary" id="btn-copy-code">Copy Join Code</button><button class="btn-secondary btn-danger" id="btn-leave-mission">Leave</button></div>` : ''}
      ${missions.length ? `<h4>Your Missions</h4><div id="mission-list">${missions.map(m=>`<div class="mission-card" data-id="${m.id}"><div class="mission-card-info"><div class="mission-card-name">${m.name}</div><div class="mission-card-meta">Code: ${m.id.slice(0,8).toUpperCase()}</div></div></div>`).join('')}</div>` : ''}
      <div class="or-divider">Create or Join</div>
      <div class="field-group"><label for="new-mission-name">New Mission Name</label><input id="new-mission-name" type="text" placeholder="e.g. Exercise IRON EAGLE"></div>
      <button class="btn-primary btn-full" id="btn-create-mission" style="margin-bottom:12px">Create Mission</button>
      <div class="field-group"><label for="join-code">Join Code</label><input id="join-code" type="text" placeholder="Paste full mission ID" autocapitalize="characters"></div>
      <button class="btn-secondary btn-full" id="btn-join-mission">Join Mission</button>
      <div id="mission-error" class="error-msg" hidden></div>`;
    document.getElementById('btn-create-mission').addEventListener('click', async () => {
      const name = document.getElementById('new-mission-name').value.trim();
      const err = document.getElementById('mission-error'); err.hidden = true;
      try { await Mission.create(name); UI.closeSheet('sheet-mission'); UI.toast('Mission created!', 'success'); }
      catch(e) { err.textContent = e.message; err.hidden = false; }
    });
    document.getElementById('btn-join-mission').addEventListener('click', async () => {
      const code = document.getElementById('join-code').value.trim();
      const err = document.getElementById('mission-error'); err.hidden = true;
      try { await Mission.join(code); UI.closeSheet('sheet-mission'); UI.toast('Joined!', 'success'); }
      catch(e) { err.textContent = e.message; err.hidden = false; }
    });
    document.getElementById('btn-copy-code')?.addEventListener('click', () => { navigator.clipboard?.writeText(Mission.current.id); UI.toast('Code copied!', 'success'); });
    document.getElementById('btn-leave-mission')?.addEventListener('click', () => { if (confirm('Leave this mission?')) { Mission.leave(); MapCtrl.clearMission(); UI.setMissionLabel(null); UI.closeSheet('sheet-mission'); UI.toast('Left mission', 'info'); } });
    document.querySelectorAll('#mission-list .mission-card').forEach(card => {
      card.addEventListener('click', async () => { try { await Mission.join(card.dataset.id); UI.closeSheet('sheet-mission'); UI.toast('Mission activated', 'success'); } catch(e) { UI.toast(e.message, 'error'); } });
    });
  },

  buildLayersSheet() {
    const grid = document.getElementById('basemap-grid'); grid.innerHTML = '';
    Object.entries(BASEMAPS).forEach(([key, bm]) => {
      const div = document.createElement('div');
      div.className = 'basemap-opt' + (MapCtrl._currentBase === key ? ' active' : '');
      div.innerHTML = `<div class="basemap-thumb"></div>${bm.name}`;
      div.addEventListener('click', () => { MapCtrl.setBasemap(key); document.querySelectorAll('.basemap-opt').forEach(d => d.classList.remove('active')); div.classList.add('active'); });
      grid.appendChild(div);
    });
    document.getElementById('overlay-list').innerHTML = `<div class="overlay-row"><label for="tog-grid">MGRS Grid</label><label class="toggle"><input id="tog-grid" type="checkbox" checked><span class="toggle-track"></span></label></div><div class="overlay-row"><label for="tog-units">Units</label><label class="toggle"><input id="tog-units" type="checkbox" checked><span class="toggle-track"></span></label></div>`;
    document.getElementById('tog-grid').addEventListener('change', e => MapCtrl.setGridVisible(e.target.checked));
    document.getElementById('tog-units').addEventListener('change', e => { e.target.checked ? MapCtrl._unitLayer.addTo(MapCtrl.map) : MapCtrl.map.removeLayer(MapCtrl._unitLayer); });
  }
};

const App = {
  _symFilter: 'F', _symEchelon: '', _watchId: null,

  async init() {
    document.querySelectorAll('.btn-close').forEach(btn => { const sheet = btn.closest('.sheet'); if (sheet) btn.addEventListener('click', () => UI.closeSheet(sheet.id)); });
    document.getElementById('btn-auth-submit').addEventListener('click', () => this._handleAuthSubmit());
    document.getElementById('auth-callsign').addEventListener('keydown', e => { if (e.key === 'Enter') this._handleAuthSubmit(); });
    document.getElementById('mission-chip').addEventListener('click', async () => { const missions = Auth.signedIn ? await DB.getUserMissions(Auth.user.id) : []; UI.showMissionSheet(missions); UI.showSheet('sheet-mission'); });
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        if (tool === 'place-unit') { this._symFilter = 'F'; this._symEchelon = ''; UI.buildSymbolGrid('F', ''); }
        UI.toolBtn(tool); MapCtrl.setTool(tool);
      });
    });
    document.getElementById('symbol-filters').addEventListener('click', e => { const b = e.target.closest('.filter-btn'); if (!b) return; document.querySelectorAll('.filter-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); this._symFilter = b.dataset.filter; UI.buildSymbolGrid(this._symFilter, this._symEchelon); });
    document.getElementById('echelon-bar').addEventListener('click', e => { const b = e.target.closest('.ech-btn'); if (!b) return; document.querySelectorAll('.ech-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); this._symEchelon = b.dataset.ech; UI.buildSymbolGrid(this._symFilter, this._symEchelon); });
    document.getElementById('btn-fullmap').addEventListener('click', () => document.body.classList.toggle('fullmap'));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (document.body.classList.contains('fullmap')) document.body.classList.remove('fullmap'); else { UI.closeAllSheets(); MapCtrl.setTool('select'); UI.toolBtn('select'); } } });
    document.getElementById('btn-locate').addEventListener('click', () => this._toggleTracking());
    document.getElementById('coord-chip').addEventListener('click', () => { const txt = document.getElementById('coord-mgrs').textContent; navigator.clipboard?.writeText(txt); UI.toast('MGRS copied: ' + txt, 'success'); });
    document.getElementById('btn-layers').addEventListener('click', () => { UI.buildLayersSheet(); UI.showSheet('sheet-layers'); });
    document.getElementById('btn-roster-toggle').addEventListener('click', () => document.getElementById('panel-roster').classList.toggle('collapsed'));
    document.getElementById('btn-measure-clear').addEventListener('click', () => MapCtrl.clearMeasure());
    document.getElementById('btn-plot-go').addEventListener('click', () => this._plotGrid());
    document.getElementById('plot-input').addEventListener('keydown', e => { if (e.key === 'Enter') this._plotGrid(); });
    document.getElementById('btn-chat').addEventListener('click', () => UI.toast('C2 Comms coming in Phase 3', 'info'));
    MapCtrl.init();
    const authed = await Auth.init();
    if (!authed) { UI.showSheet('sheet-auth'); return; }
    await this._postAuth();
  },

  async _handleAuthSubmit() {
    const callsign = document.getElementById('auth-callsign').value;
    const email = document.getElementById('auth-email').value;
    const errEl = document.getElementById('auth-error');
    const btn = document.getElementById('btn-auth-submit');
    errEl.hidden = true; btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      const result = await Auth.signIn(callsign, email);
      if (result.otpSent) { errEl.textContent = 'Magic link sent! Check your email.'; errEl.style.color = 'var(--green)'; errEl.hidden = false; btn.textContent = 'Check email →'; return; }
      UI.closeSheet('sheet-auth'); await this._postAuth();
    } catch (e) { errEl.textContent = e.message; errEl.hidden = false; btn.disabled = false; btn.textContent = 'Continue →'; }
  },

  async _postAuth() {
    const m = await Mission.restore();
    if (m) { UI.setMissionLabel(m.name); await MapCtrl.loadMission(m.id); UI.toast(`Welcome back, ${Auth.callsign}`, 'success'); }
    else { UI.toast(`Signed in as ${Auth.callsign}`, 'success'); }
  },

  onMissionActivated(m) { UI.setMissionLabel(m.name); MapCtrl.loadMission(m.id); },

  _plotGrid() {
    const raw = document.getElementById('plot-input').value;
    const errEl = document.getElementById('plot-error'); errEl.hidden = true;
    const result = parseMGRS(raw);
    if (!result.valid) { errEl.textContent = 'Invalid grid. Try "16TDL123456" or just "123456" for a local grid.'; errEl.hidden = false; return; }
    MapCtrl.panTo(result.lat, result.lng, 15);
    UI.closeSheet('sheet-plot-grid');
    UI.toast(`Plotting: ${toMGRS(result.lat, result.lng, 5)}${result.note ? ' ('+result.note+')' : ''}`, 'info');
    const marker = L.circleMarker([result.lat, result.lng], { radius: 8, color: '#d29922', fillColor: '#d29922', fillOpacity: 0.8 }).addTo(MapCtrl.map);
    marker.bindPopup(`<div class="popup-body"><div class="popup-name">Plotted Grid</div><div class="popup-mgrs">${toMGRS(result.lat, result.lng, 5)}</div></div>`, { autoPan: false }).openPopup();
    setTimeout(() => marker.remove(), 30000);
  },

  _toggleTracking() {
    if (this._watchId) { navigator.geolocation.clearWatch(this._watchId); this._watchId = null; document.getElementById('btn-locate').classList.remove('active'); UI.toast('Location tracking off', 'info'); return; }
    if (!navigator.geolocation) { UI.toast('Geolocation not supported', 'error'); return; }
    this._watchId = navigator.geolocation.watchPosition(
      pos => { const { latitude: lat, longitude: lng } = pos.coords; MapCtrl.showSelf(lat, lng); MapCtrl.panTo(lat, lng); document.getElementById('btn-locate').classList.add('active'); },
      err => { UI.toast('Location error: ' + err.message, 'error'); this._watchId = null; document.getElementById('btn-locate').classList.remove('active'); },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
  }
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => App.init());
else App.init();
