// Main application controller

const REDCON_COLORS = ['', '#f85149', '#ff8c00', '#d29922', '#3fb950', '#58a6ff'];
const REDCON_LABELS = ['', 'IMMEDIATE ACTION', 'READY TO FIGHT', '30 MIN READINESS', 'MIN ALERT', 'NORMAL'];

const UI = {
  toast(msg, type = 'info', duration = 3000) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    document.getElementById('toasts').appendChild(el);
    setTimeout(() => el.remove(), duration);
  },

  showSheet(id)  { document.getElementById(id)?.classList.remove('hidden'); },
  closeSheet(id) { document.getElementById(id)?.classList.add('hidden'); },
  closeAllSheets() {
    document.querySelectorAll('.sheet:not(#sheet-auth)').forEach(s => s.classList.add('hidden'));
  },

  toolBtn(tool) {
    document.querySelectorAll('.tool-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.tool === tool));
  },

  setMissionLabel(name) {
    document.getElementById('mission-chip-label').textContent = name || 'No Mission';
  },

  updateRoster(state) {
    const list    = document.getElementById('roster-list');
    const members = Object.values(state).flat();
    if (!members.length) {
      list.innerHTML = '<p class="empty-msg">No members online</p>';
      return;
    }
    list.innerHTML = members.map(m => `
      <div class="roster-item">
        <div class="roster-avatar">${(m.callsign || '?').slice(0,2)}</div>
        <div class="roster-info">
          <div class="roster-callsign">${m.callsign || 'Unknown'}</div>
          <div class="roster-pos">${m.mgrs || ''}</div>
        </div>
        <div class="roster-dot online"></div>
      </div>
    `).join('');
  },

  buildSymbolGrid(filter = 'F', echelon = '') {
    const search = (document.getElementById('symbol-search')?.value || '').toLowerCase();
    const grid   = document.getElementById('symbol-grid');
    const items  = CATALOG.filter(c => {
      if (c.cat !== filter) return false;
      if (search && !c.name.toLowerCase().includes(search)) return false;
      return true;
    });

    grid.innerHTML = '';
    if (!items.length) {
      grid.innerHTML = '<p class="empty-msg" style="padding:12px">No symbols match</p>';
      return;
    }

    items.forEach(entry => {
      const sidc = buildSIDC(entry.base, echelon);
      const div  = document.createElement('div');
      div.className = 'symbol-item';
      div.title     = entry.name;
      div.appendChild(catalogIcon(sidc, 38));
      const label = document.createElement('span');
      label.textContent = entry.name;
      div.appendChild(label);
      div.addEventListener('click', () => {
        MapCtrl.setActiveSIDC(entry, echelon);
        UI.closeSheet('sheet-symbols');
        UI.toast(`${entry.name} — tap map to place`, 'info', 2500);
      });
      grid.appendChild(div);
    });
  },

  buildGraphicGrid(filter = 'LN') {
    document.querySelectorAll('.graphic-tab').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === filter));

    const grid  = document.getElementById('graphic-grid');
    const items = GRAPHIC_CATALOG.filter(g => g.cat === filter);
    grid.innerHTML = '';

    items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'graphic-item';

      const previewStyle = item.type === 'line'
        ? `height:4px;border-radius:2px;background:${item.color};` +
          (item.dash ? `background:repeating-linear-gradient(90deg,${item.color} 0,${item.color} 8px,transparent 8px,transparent 14px);` : '')
        : `height:28px;border-radius:4px;border:2px ${item.dash ? 'dashed' : 'solid'} ${item.color};` +
          `background:${item.color}22;`;

      div.innerHTML = `
        <div class="graphic-preview" style="${previewStyle}"></div>
        <span class="graphic-name">${item.name}</span>
        ${item.label ? `<span class="graphic-code">${item.label}</span>` : ''}
      `;

      div.addEventListener('click', () => {
        MapCtrl.startGraphicDraw(item);
        UI.closeSheet('sheet-graphic-picker');
        const tip = item.type === 'area'
          ? `${item.name}: tap to add points (3+ needed), dbl-tap to finish`
          : `${item.name}: tap to add points, dbl-tap to finish`;
        UI.toast(tip, 'info', 3500);
      });

      grid.appendChild(div);
    });
  },

  showUnitDetail(unit, { onEdit, onDelete }) {
    const sidc    = unit.sidc || 'SFGPUC-----';
    const sym     = new ms.Symbol(sidc, { size: 50 });
    const mgrsStr = toMGRS(unit.lat, unit.lng, 5) || `${unit.lat.toFixed(5)}, ${unit.lng.toFixed(5)}`;
    const rc      = unit.redcon || 5;
    const col     = REDCON_COLORS[rc];

    const lace    = unit.lace;
    const laceHTML = lace ? `
      <div class="section-label">LACE STATUS</div>
      <div class="lace-display">
        ${['l','a','e'].map((k, i) => `
          <div class="lace-row">
            <span class="lace-key">${['L','A','E'][i]}</span>
            <div class="lace-bar-bg"><div class="lace-fill ${Reports.laceColor(lace[k])}" style="width:${lace[k]}%"></div></div>
            <span class="lace-val">${lace[k]}%</span>
          </div>
        `).join('')}
        <div class="lace-row">
          <span class="lace-key">C</span>
          <div class="lace-bar-bg" style="background:rgba(248,81,73,0.15)"></div>
          <span class="lace-val">${lace.c} cas</span>
        </div>
      </div>
    ` : '';

    const rcBtns = [1,2,3,4,5].map(r => {
      const c   = REDCON_COLORS[r];
      const act = r === rc;
      return `<button class="rc-btn${act ? ' active' : ''}" data-rc="${r}"
        style="${act ? `background:${c}22;border-color:${c};color:${c}` : ''}">${r}</button>`;
    }).join('');

    document.getElementById('unit-detail-content').innerHTML = `
      <div class="unit-header">
        <img src="${sym.toDataURL()}" alt="symbol">
        <div class="unit-header-info">
          <div class="unit-title" id="ud-title">${unit.callsign || 'Unit'}</div>
          <div class="unit-meta">${unit.sidc}</div>
          <div class="redcon-badge" id="ud-rcbadge"
            style="background:${col}22;border-color:${col}66;color:${col}">RC${rc} — ${REDCON_LABELS[rc]}</div>
        </div>
      </div>

      <div class="redcon-row">
        <span class="redcon-label">REDCON</span>
        <div class="redcon-btns" id="redcon-btns">${rcBtns}</div>
      </div>

      ${laceHTML}

      <div class="field-group">
        <label for="edit-callsign">Callsign / Designation</label>
        <input id="edit-callsign" type="text" value="${(unit.callsign || '').replace(/"/g,'&quot;')}"
               maxlength="24" autocapitalize="characters">
      </div>
      <div class="field-group">
        <label for="edit-notes">Notes / Remarks</label>
        <input id="edit-notes" type="text" value="${(unit.notes || '').replace(/"/g,'&quot;')}"
               placeholder="Optional remarks">
      </div>
      <dl class="detail-dl">
        <dt>MGRS</dt><dd>${mgrsStr}</dd>
        <dt>Lat/Lng</dt><dd>${unit.lat.toFixed(5)}, ${unit.lng.toFixed(5)}</dd>
        <dt>Updated</dt><dd>${unit.updated_at ? new Date(unit.updated_at).toLocaleTimeString() : '—'}</dd>
      </dl>
      <div class="btn-row" style="margin-bottom:8px">
        <button class="btn-primary" id="btn-unit-save">Save</button>
        <button class="btn-secondary" id="btn-file-lace">File LACE</button>
      </div>
      <button class="btn-secondary btn-danger btn-full" id="btn-unit-delete">Delete</button>
    `;

    let curRC = rc;
    document.getElementById('redcon-btns').addEventListener('click', e => {
      const btn = e.target.closest('.rc-btn');
      if (!btn) return;
      curRC = +btn.dataset.rc;
      const c = REDCON_COLORS[curRC];
      document.querySelectorAll('.rc-btn').forEach(b => {
        const r = +b.dataset.rc;
        const bc = REDCON_COLORS[r];
        b.classList.toggle('active', r === curRC);
        b.style.background  = r === curRC ? bc + '22' : '';
        b.style.borderColor = r === curRC ? bc : '';
        b.style.color       = r === curRC ? bc : '';
      });
      const badge = document.getElementById('ud-rcbadge');
      if (badge) {
        badge.style.background  = c + '22';
        badge.style.borderColor = c + '66';
        badge.style.color       = c;
        badge.textContent       = `RC${curRC} — ${REDCON_LABELS[curRC]}`;
      }
    });

    document.getElementById('btn-file-lace').addEventListener('click', () => {
      UI.closeSheet('sheet-unit');
      Reports.openLACE(unit.id, unit.lace);
    });

    document.getElementById('btn-unit-save').addEventListener('click', () => {
      const cs    = document.getElementById('edit-callsign').value.trim();
      const notes = document.getElementById('edit-notes').value.trim();
      if (cs) {
        onEdit({ callsign: cs, notes, redcon: curRC });
        document.getElementById('ud-title').textContent = cs;
      }
      UI.closeSheet('sheet-unit');
    });

    document.getElementById('edit-callsign').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btn-unit-save').click();
    });

    let deleteStep = 0;
    document.getElementById('btn-unit-delete').addEventListener('click', () => {
      deleteStep++;
      if (deleteStep === 1) {
        const btn = document.getElementById('btn-unit-delete');
        if (btn) { btn.textContent = 'Tap again to confirm'; btn.style.background = 'rgba(248,81,73,0.4)'; }
        setTimeout(() => {
          deleteStep = 0;
          const b = document.getElementById('btn-unit-delete');
          if (b) { b.textContent = 'Delete'; b.style.background = ''; }
        }, 3000);
      } else {
        onDelete();
      }
    });

    this.showSheet('sheet-unit');
  },

  showMissionSheet(missions = []) {
    const c = document.getElementById('mission-content');
    c.innerHTML = `
      <h3>Mission</h3>
      ${Mission.active ? `
        <div class="mission-card" style="border-color:rgba(63,185,80,0.4)">
          <div class="mission-card-info">
            <div class="mission-card-name">${Mission.current.name}</div>
            <div class="mission-card-meta">Code: ${Mission.current.id.slice(0,8).toUpperCase()}</div>
          </div>
          <span class="badge">Active</span>
        </div>
        <div class="btn-row" style="margin-bottom:16px">
          <button class="btn-secondary" id="btn-copy-code">Copy Join Code</button>
          <button class="btn-secondary btn-danger" id="btn-leave-mission">Leave</button>
        </div>
      ` : ''}
      ${missions.length ? `
        <h4>Your Missions</h4>
        <div class="mission-list" id="mission-list">
          ${missions.map(m => `
            <div class="mission-card" data-id="${m.id}">
              <div class="mission-card-info">
                <div class="mission-card-name">${m.name}</div>
                <div class="mission-card-meta">Code: ${m.id.slice(0,8).toUpperCase()}</div>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
      <div class="or-divider">Create or Join</div>
      <div class="field-group">
        <label for="new-mission-name">New Mission Name</label>
        <input id="new-mission-name" type="text" placeholder="e.g. Exercise IRON EAGLE">
      </div>
      <button class="btn-primary btn-full" id="btn-create-mission" style="margin-bottom:12px">Create Mission</button>
      <div class="field-group">
        <label for="join-code">Join Code</label>
        <input id="join-code" type="text" placeholder="8-character code" autocapitalize="characters">
      </div>
      <button class="btn-secondary btn-full" id="btn-join-mission">Join Mission</button>
      <div id="mission-error" class="error-msg" hidden></div>
    `;

    document.getElementById('btn-create-mission').addEventListener('click', async () => {
      const name = document.getElementById('new-mission-name').value.trim();
      const err  = document.getElementById('mission-error');
      err.hidden = true;
      try {
        await Mission.create(name);
        UI.closeSheet('sheet-mission');
        UI.toast('Mission created!', 'success');
      } catch(e) { err.textContent = e.message; err.hidden = false; }
    });

    document.getElementById('btn-join-mission').addEventListener('click', async () => {
      const code = document.getElementById('join-code').value.trim();
      const err  = document.getElementById('mission-error');
      err.hidden = true;
      try {
        await Mission.join(code);
        UI.closeSheet('sheet-mission');
        UI.toast('Joined mission!', 'success');
      } catch(e) { err.textContent = e.message; err.hidden = false; }
    });

    document.getElementById('btn-copy-code')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(Mission.current.id.slice(0,8).toUpperCase());
      UI.toast('Code copied!', 'success');
    });

    let leaveStep = 0;
    document.getElementById('btn-leave-mission')?.addEventListener('click', () => {
      leaveStep++;
      if (leaveStep === 1) {
        const btn = document.getElementById('btn-leave-mission');
        if (btn) btn.textContent = 'Tap again to confirm';
        setTimeout(() => {
          leaveStep = 0;
          const b = document.getElementById('btn-leave-mission');
          if (b) b.textContent = 'Leave';
        }, 3000);
      } else {
        BFT.leaveMission();
        Chat.leave();
        Mission.leave();
        MapCtrl.clearMission();
        UI.setMissionLabel(null);
        UI.closeSheet('sheet-mission');
        UI.toast('Left mission', 'info');
      }
    });

    document.querySelectorAll('#mission-list .mission-card').forEach(card => {
      card.addEventListener('click', async () => {
        try {
          await Mission.join(card.dataset.id);
          UI.closeSheet('sheet-mission');
          UI.toast('Mission activated', 'success');
        } catch(e) { UI.toast(e.message, 'error'); }
      });
    });
  },

  buildLayersSheet() {
    const grid = document.getElementById('basemap-grid');
    grid.innerHTML = '';
    Object.entries(BASEMAPS).forEach(([key, bm]) => {
      const div = document.createElement('div');
      div.className = 'basemap-opt' + (MapCtrl._currentBase === key ? ' active' : '');
      div.dataset.key = key;
      div.innerHTML = `<div class="basemap-thumb"></div>${bm.name}`;
      div.addEventListener('click', () => {
        MapCtrl.setBasemap(key);
        document.querySelectorAll('.basemap-opt').forEach(d => d.classList.remove('active'));
        div.classList.add('active');
      });
      grid.appendChild(div);
    });

    document.getElementById('overlay-list').innerHTML = `
      <div class="overlay-row">
        <label for="tog-grid">MGRS Grid</label>
        <label class="toggle">
          <input id="tog-grid" type="checkbox" checked>
          <span class="toggle-track"></span>
        </label>
      </div>
      <div class="overlay-row">
        <label for="tog-units">Units</label>
        <label class="toggle">
          <input id="tog-units" type="checkbox" checked>
          <span class="toggle-track"></span>
        </label>
      </div>
      <div class="overlay-row">
        <label for="tog-graphics">Graphics</label>
        <label class="toggle">
          <input id="tog-graphics" type="checkbox" checked>
          <span class="toggle-track"></span>
        </label>
      </div>
      <div class="overlay-row">
        <label for="tog-bft">BFT Tracks</label>
        <label class="toggle">
          <input id="tog-bft" type="checkbox" checked>
          <span class="toggle-track"></span>
        </label>
      </div>
    `;

    document.getElementById('tog-grid').addEventListener('change', e =>
      MapCtrl.setGridVisible(e.target.checked));
    document.getElementById('tog-units').addEventListener('change', e =>
      e.target.checked ? MapCtrl._unitLayer.addTo(MapCtrl.map) : MapCtrl.map.removeLayer(MapCtrl._unitLayer));
    document.getElementById('tog-graphics').addEventListener('change', e =>
      e.target.checked ? MapCtrl._graphicLayer.addTo(MapCtrl.map) : MapCtrl.map.removeLayer(MapCtrl._graphicLayer));
    document.getElementById('tog-bft').addEventListener('change', e => {
      const bftLayer = BFT._layer;
      if (!bftLayer) return;
      e.target.checked ? bftLayer.addTo(MapCtrl.map) : MapCtrl.map.removeLayer(bftLayer);
    });
  }
};

const App = {
  _symFilter:     'F',
  _symEchelon:    '',
  _graphicTab:    'LN',
  _watchId:       null,
  _labelCallback: null,
  _lastBFT:       0,

  promptLabel(typeName, prefix, cb) {
    this._labelCallback = cb;
    const input = document.getElementById('label-input');
    const title = document.getElementById('sheet-label-title');
    if (title) title.textContent = `Label for ${typeName}`;
    if (input) input.value = prefix ? prefix.trimEnd() + ' ' : '';
    UI.showSheet('sheet-label');
    setTimeout(() => { try { input?.focus(); input?.select(); } catch {} }, 150);
  },

  _confirmLabel(skip) {
    const value = skip ? '' : (document.getElementById('label-input')?.value || '').trim();
    UI.closeSheet('sheet-label');
    if (this._labelCallback) {
      this._labelCallback(value);
      this._labelCallback = null;
    }
  },

  async init() {
    document.querySelectorAll('.btn-close').forEach(btn => {
      const sheet = btn.closest('.sheet');
      if (sheet) btn.addEventListener('click', () => UI.closeSheet(sheet.id));
    });

    document.getElementById('btn-auth-submit').addEventListener('click', () => this._handleAuthSubmit());
    document.getElementById('auth-callsign').addEventListener('keydown', e => {
      if (e.key === 'Enter') this._handleAuthSubmit();
    });

    document.getElementById('mission-chip').addEventListener('click', async () => {
      const missions = Auth.signedIn ? await DB.getUserMissions(Auth.user.id) : [];
      UI.showMissionSheet(missions);
      UI.showSheet('sheet-mission');
    });

    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;

        if (tool === 'place-unit') {
          this._symFilter  = 'F';
          this._symEchelon = '';
          UI.buildSymbolGrid('F', '');
          UI.showSheet('sheet-symbols');
        }

        if (tool === 'draw-graphic') {
          this._graphicTab = 'LN';
          UI.buildGraphicGrid('LN');
          UI.showSheet('sheet-graphic-picker');
        }

        if (tool === 'reports') {
          UI.showSheet('sheet-reports-menu');
        }

        UI.toolBtn(tool);
        if (tool !== 'reports') MapCtrl.setTool(tool);
      });
    });

    document.getElementById('symbol-filters').addEventListener('click', e => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this._symFilter = btn.dataset.filter;
      UI.buildSymbolGrid(this._symFilter, this._symEchelon);
    });

    document.getElementById('echelon-bar').addEventListener('click', e => {
      const btn = e.target.closest('.ech-btn');
      if (!btn) return;
      document.querySelectorAll('.ech-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this._symEchelon = btn.dataset.ech;
      UI.buildSymbolGrid(this._symFilter, this._symEchelon);
    });

    document.getElementById('symbol-search')?.addEventListener('input', () => {
      UI.buildSymbolGrid(this._symFilter, this._symEchelon);
    });

    document.getElementById('graphic-tabs').addEventListener('click', e => {
      const btn = e.target.closest('.graphic-tab');
      if (!btn) return;
      this._graphicTab = btn.dataset.tab;
      UI.buildGraphicGrid(this._graphicTab);
    });

    document.getElementById('btn-draw-finish')?.addEventListener('click', () => MapCtrl.finishDraw());
    document.getElementById('btn-draw-undo')?.addEventListener('click',   () => MapCtrl.undoLastPoint());
    document.getElementById('btn-draw-cancel')?.addEventListener('click', () => MapCtrl.cancelDraw());

    document.getElementById('btn-label-done')?.addEventListener('click',  () => this._confirmLabel(false));
    document.getElementById('btn-label-skip')?.addEventListener('click',  () => this._confirmLabel(true));
    document.getElementById('btn-label-close')?.addEventListener('click', () => this._confirmLabel(true));
    document.getElementById('label-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') this._confirmLabel(false);
    });

    document.getElementById('btn-fullmap').addEventListener('click', () => {
      document.body.classList.toggle('fullmap');
    });
    document.getElementById('btn-exit-fullmap')?.addEventListener('click', () => {
      document.body.classList.remove('fullmap');
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (document.body.classList.contains('fullmap')) {
          document.body.classList.remove('fullmap');
        } else if (MapCtrl._isDrawing()) {
          MapCtrl.cancelDraw();
        } else if (MapCtrl._activeTool === 'place-unit') {
          MapCtrl.setTool('select');
          UI.toolBtn('select');
        } else {
          UI.closeAllSheets();
          MapCtrl.setTool('select');
          UI.toolBtn('select');
        }
      }
    });

    document.getElementById('btn-locate').addEventListener('click', () => this._toggleTracking());

    document.getElementById('coord-chip').addEventListener('click', () => {
      const txt = document.getElementById('coord-mgrs').textContent;
      navigator.clipboard?.writeText(txt);
      UI.toast('MGRS copied: ' + txt, 'success');
    });

    document.getElementById('btn-layers').addEventListener('click', () => {
      UI.buildLayersSheet();
      UI.showSheet('sheet-layers');
    });

    document.getElementById('btn-roster-toggle').addEventListener('click', () =>
      document.getElementById('panel-roster').classList.toggle('collapsed'));

    document.getElementById('btn-measure-clear').addEventListener('click', () => MapCtrl.clearMeasure());

    document.getElementById('btn-plot-go').addEventListener('click', () => this._plotGrid());
    document.getElementById('plot-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') this._plotGrid();
    });

    document.getElementById('btn-chat').addEventListener('click', () => {
      if (Chat.isJoined()) {
        Chat.open();
      } else {
        UI.toast('Join a mission to use chat', 'info');
      }
    });

    document.getElementById('btn-chat-send')?.addEventListener('click', () => this._sendChat());
    document.getElementById('chat-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._sendChat(); }
    });

    document.getElementById('chat-canned')?.addEventListener('click', e => {
      const btn = e.target.closest('.canned-btn');
      if (!btn) return;
      const input = document.getElementById('chat-input');
      if (input) { input.value = btn.dataset.msg; input.focus(); }
    });

    const cannedContainer = document.getElementById('chat-canned');
    if (cannedContainer) {
      cannedContainer.innerHTML = Chat.CANNED.map(m =>
        `<button class="canned-btn" data-msg="${m.replace(/"/g,'&quot;')}">${m}</button>`
      ).join('');
    }

    document.getElementById('btn-rpt-lace')?.addEventListener('click', () => {
      UI.closeSheet('sheet-reports-menu');
      Reports.openLACE(null);
    });
    document.getElementById('btn-rpt-spotrep')?.addEventListener('click', () => {
      UI.closeSheet('sheet-reports-menu');
      const c = MapCtrl.map.getCenter();
      Reports.openSPOTREP(c.lat, c.lng);
    });
    document.getElementById('btn-rpt-9line')?.addEventListener('click', () => {
      UI.closeSheet('sheet-reports-menu');
      const c = MapCtrl.map.getCenter();
      Reports.open9Line(c.lat, c.lng);
    });
    document.getElementById('btn-rpt-sitrep')?.addEventListener('click', () => {
      UI.closeSheet('sheet-reports-menu');
      Reports.openSITREP();
    });

    ['lace-liquid','lace-ammo','lace-equip','lace-cas'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => Reports._updateLACEBars());
    });
    document.getElementById('btn-lace-submit')?.addEventListener('click', () => Reports.submitLACE());
    document.getElementById('btn-spotrep-submit')?.addEventListener('click', () => Reports.submitSPOTREP());
    document.getElementById('btn-9line-submit')?.addEventListener('click', () => Reports.submit9Line());
    document.getElementById('btn-sitrep-submit')?.addEventListener('click', () => Reports.submitSITREP());

    document.getElementById('ctx-spotrep')?.addEventListener('click', () => {
      UI.closeSheet('sheet-context');
      const ll = MapCtrl._ctxLatLng;
      if (ll) Reports.openSPOTREP(ll.lat, ll.lng);
    });
    document.getElementById('ctx-9line')?.addEventListener('click', () => {
      UI.closeSheet('sheet-context');
      const ll = MapCtrl._ctxLatLng;
      if (ll) Reports.open9Line(ll.lat, ll.lng);
    });
    document.getElementById('ctx-waypoint')?.addEventListener('click', () => {
      UI.closeSheet('sheet-context');
      const ll = MapCtrl._ctxLatLng;
      if (ll) {
        MapCtrl.setActiveSIDC({ id: 'wp', name: 'Waypoint', base: 'SFGPU------', cat: 'F' }, '');
        MapCtrl._placeUnitAt(ll);
        MapCtrl.setTool('select');
        UI.toolBtn('select');
      }
    });
    document.getElementById('ctx-chat-grid')?.addEventListener('click', () => {
      UI.closeSheet('sheet-context');
      const ll   = MapCtrl._ctxLatLng;
      const mgrs = ll ? toMGRS(ll.lat, ll.lng, 5) : '';
      const input = document.getElementById('chat-input');
      if (input) input.value = `Grid: ${mgrs}`;
      if (Chat.isJoined()) {
        Chat.open();
      } else {
        UI.toast('Join a mission to use chat', 'info');
      }
    });

    document.getElementById('btn-bft-card-close')?.addEventListener('click', () =>
      UI.closeSheet('sheet-bft-card'));

    MapCtrl.init();

    const authed = await Auth.init();
    if (!authed) {
      UI.showSheet('sheet-auth');
      return;
    }

    await this._postAuth();
  },

  _sendChat() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    if (Chat.send(text)) {
      input.value = '';
    } else {
      UI.toast('Not connected to chat', 'error');
    }
  },

  async _handleAuthSubmit() {
    const callsign = document.getElementById('auth-callsign').value;
    const email    = document.getElementById('auth-email').value;
    const errEl    = document.getElementById('auth-error');
    const btn      = document.getElementById('btn-auth-submit');

    errEl.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Signing in…';

    try {
      const result = await Auth.signIn(callsign, email);
      if (result.otpSent) {
        errEl.textContent = 'Magic link sent! Check your email.';
        errEl.style.color = 'var(--green)';
        errEl.hidden = false;
        btn.textContent = 'Check email →';
        return;
      }
      UI.closeSheet('sheet-auth');
      await this._postAuth();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Continue →';
    }
  },

  async _postAuth() {
    const m = await Mission.restore();
    if (m) {
      UI.setMissionLabel(m.name);
      await MapCtrl.loadMission(m.id);
      BFT.joinMission(m.id);
      Chat.join(m.id);
      UI.toast(`Welcome back, ${Auth.callsign}`, 'success');
    } else {
      MapCtrl.loadLocalData();
      UI.toast(`Signed in as ${Auth.callsign}`, 'success');
    }
  },

  onMissionActivated(m) {
    UI.setMissionLabel(m.name);
    MapCtrl.loadMission(m.id);
    BFT.joinMission(m.id);
    Chat.join(m.id);
  },

  _plotGrid() {
    const raw   = document.getElementById('plot-input').value;
    const errEl = document.getElementById('plot-error');
    errEl.hidden = true;

    const result = parseMGRS(raw);
    if (!result.valid) {
      errEl.textContent = 'Invalid grid. Try "16TDL123456" or just "123456".';
      errEl.hidden = false;
      return;
    }

    MapCtrl.panTo(result.lat, result.lng, 15);
    UI.closeSheet('sheet-plot-grid');

    const marker = L.circleMarker([result.lat, result.lng], {
      radius: 8, color: '#d29922', fillColor: '#d29922', fillOpacity: 0.8
    }).addTo(MapCtrl.map);
    marker.bindPopup(
      `<div class="popup-body"><div class="popup-name">Plotted Grid</div>` +
      `<div class="popup-mgrs">${toMGRS(result.lat, result.lng, 5)}</div></div>`,
      { autoPan: false }
    ).openPopup();
    setTimeout(() => marker.remove(), 30000);

    const note = result.note ? ` (${result.note})` : '';
    UI.toast(`Plotting: ${toMGRS(result.lat, result.lng, 5)}${note}`, 'info');
  },

  _toggleTracking() {
    if (this._watchId) {
      navigator.geolocation.clearWatch(this._watchId);
      this._watchId = null;
      document.getElementById('btn-locate').classList.remove('active');
      UI.toast('Location tracking off', 'info');
      return;
    }
    if (!navigator.geolocation) { UI.toast('Geolocation not supported', 'error'); return; }

    this._watchId = navigator.geolocation.watchPosition(
      pos => {
        const { latitude: lat, longitude: lng, heading, speed } = pos.coords;
        MapCtrl.showSelf(lat, lng);
        MapCtrl.panTo(lat, lng);
        document.getElementById('btn-locate').classList.add('active');

        if (Mission.active) {
          const now = Date.now();
          if (now - this._lastBFT > 15000) {
            this._lastBFT = now;
            BFT.broadcast(lat, lng, heading, speed);
          }
        }
      },
      err => {
        UI.toast('Location error: ' + err.message, 'error');
        this._watchId = null;
        document.getElementById('btn-locate').classList.remove('active');
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}
