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

  // ── Symbol picker ──────────────────────────────────────
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
        UI.toast(`${entry.name} — click map to place (ESC to stop)`, 'info', 2500);
      });
      grid.appendChild(div);
    });
  },

  // ── Tactical graphic picker ────────────────────────────
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
          ? `${item.name}: click to add points (3+ needed), dbl-click to finish`
          : `${item.name}: click to add points, dbl-click to finish`;
        UI.toast(tip, 'info', 3500);
      });

      grid.appendChild(div);
    });
  },

  // ── Unit detail (with REDCON and LACE) ────────────────
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

      <div class="opstat-row">
        ${['FMC','PMC','NMC'].map(s => {
          const cur = unit.opstat || 'FMC';
          const cls = cur === s ? `active-${s.toLowerCase()}` : '';
          return `<button class="opstat-btn ${cls}" data-stat="${s}">${s}</button>`;
        }).join('')}
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

    // Op Status selector
    let curOpStat = unit.opstat || 'FMC';
    document.querySelector('.opstat-row')?.addEventListener('click', e => {
      const btn = e.target.closest('.opstat-btn');
      if (!btn) return;
      curOpStat = btn.dataset.stat;
      document.querySelectorAll('.opstat-btn').forEach(b => {
        b.className = 'opstat-btn' + (b.dataset.stat === curOpStat ? ` active-${curOpStat.toLowerCase()}` : '');
      });
    });

    // REDCON selector
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
        onEdit({ callsign: cs, notes, redcon: curRC, opstat: curOpStat });
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

  // ── Mission sheet ──────────────────────────────────────
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
        <div class="btn-row" style="margin-bottom:8px">
          <button class="btn-secondary" id="btn-copy-code">Copy Join Code</button>
          <button class="btn-secondary" id="btn-share-mission">Share</button>
        </div>
        <div class="btn-row" style="margin-bottom:8px">
          <button class="btn-secondary" id="btn-export-plan">Export Plan</button>
          <button class="btn-secondary btn-danger" id="btn-leave-mission">Leave</button>
        </div>
        <div class="btn-row" style="margin-bottom:8px">
          <button class="btn-secondary" id="btn-pace-plan">PACE Plan</button>
          <button class="btn-secondary" id="btn-force-status">Force Status</button>
        </div>
        <div class="btn-row" style="margin-bottom:16px">
          <button class="btn-secondary btn-full" id="btn-cot-export">Export CoT (ATAK)</button>
        </div>
      ` : `
        <div class="btn-row" style="margin-bottom:8px">
          <button class="btn-secondary btn-full" id="btn-export-plan">Export Plan (offline)</button>
        </div>
        <div class="btn-row" style="margin-bottom:16px">
          <button class="btn-secondary" id="btn-pace-plan">PACE Plan</button>
          <button class="btn-secondary" id="btn-force-status">Force Status</button>
        </div>
      `}
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

    document.getElementById('btn-share-mission')?.addEventListener('click', () => {
      const code = Mission.current.id.slice(0,8).toUpperCase();
      const name = Mission.current.name;
      const url  = location.origin + location.pathname;
      const text = `Join mission "${name}" on Tactical COP\nCode: ${code}\n${url}`;
      if (navigator.share) {
        navigator.share({ title: `Mission: ${name}`, text }).catch(() => {});
      } else {
        navigator.clipboard?.writeText(text);
        UI.toast('Invite text copied!', 'success');
      }
    });

    document.getElementById('btn-export-plan')?.addEventListener('click', () => {
      UI.closeSheet('sheet-mission');
      App._exportPlan();
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

    document.getElementById('btn-pace-plan')?.addEventListener('click', () => {
      App._loadPACE();
      UI.closeSheet('sheet-mission');
      UI.showSheet('sheet-pace');
    });

    document.getElementById('btn-force-status')?.addEventListener('click', () => {
      App._showForceStatus();
      UI.closeSheet('sheet-mission');
    });

    document.getElementById('btn-cot-export')?.addEventListener('click', () => {
      UI.closeSheet('sheet-mission');
      App._exportCoT();
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

  // ── Layers sheet ───────────────────────────────────────
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

    // Symbol scale buttons (initialize active state from current scale)
    const curScale = MapCtrl._symbolScale;
    document.querySelectorAll('.scale-btn').forEach(btn => {
      const s = parseFloat(btn.dataset.scale);
      btn.classList.toggle('active', Math.abs(s - curScale) < 0.05);
      btn.addEventListener('click', () => {
        document.querySelectorAll('.scale-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        MapCtrl.setSymbolScale(parseFloat(btn.dataset.scale));
      });
    });
  }
};

// ── App bootstrap ─────────────────────────────────────────
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
    // Close buttons
    document.querySelectorAll('.btn-close').forEach(btn => {
      const sheet = btn.closest('.sheet');
      if (sheet) btn.addEventListener('click', () => UI.closeSheet(sheet.id));
    });

    // Auth
    document.getElementById('btn-auth-submit').addEventListener('click', () => this._handleAuthSubmit());
    document.getElementById('auth-callsign').addEventListener('keydown', e => {
      if (e.key === 'Enter') this._handleAuthSubmit();
    });

    // Mission chip
    document.getElementById('mission-chip').addEventListener('click', async () => {
      const missions = Auth.signedIn ? await DB.getUserMissions(Auth.user.id) : [];
      UI.showMissionSheet(missions);
      UI.showSheet('sheet-mission');
    });

    // Tool buttons
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

    // Long-press pin to clear all pins
    document.querySelectorAll('[data-tool="pin"]').forEach(btn => {
      let t;
      btn.addEventListener('touchstart', () => { t = setTimeout(() => { MapCtrl.clearPins(); UI.toast('Pins cleared', 'info'); }, 800); }, { passive: true });
      btn.addEventListener('touchend', () => clearTimeout(t));
      btn.addEventListener('touchmove', () => clearTimeout(t));
    });

    // Symbol picker: filter buttons
    document.getElementById('symbol-filters').addEventListener('click', e => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this._symFilter = btn.dataset.filter;
      UI.buildSymbolGrid(this._symFilter, this._symEchelon);
    });

    // Symbol picker: echelon buttons
    document.getElementById('echelon-bar').addEventListener('click', e => {
      const btn = e.target.closest('.ech-btn');
      if (!btn) return;
      document.querySelectorAll('.ech-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this._symEchelon = btn.dataset.ech;
      UI.buildSymbolGrid(this._symFilter, this._symEchelon);
    });

    // Symbol search
    document.getElementById('symbol-search')?.addEventListener('input', () => {
      UI.buildSymbolGrid(this._symFilter, this._symEchelon);
    });

    // Graphic picker: tab buttons
    document.getElementById('graphic-tabs').addEventListener('click', e => {
      const btn = e.target.closest('.graphic-tab');
      if (!btn) return;
      this._graphicTab = btn.dataset.tab;
      UI.buildGraphicGrid(this._graphicTab);
    });

    // Draw toolbar
    document.getElementById('btn-draw-finish')?.addEventListener('click', () => MapCtrl.finishDraw());
    document.getElementById('btn-draw-undo')?.addEventListener('click',   () => MapCtrl.undoLastPoint());
    document.getElementById('btn-draw-cancel')?.addEventListener('click', () => MapCtrl.cancelDraw());

    // Label sheet
    document.getElementById('btn-label-done')?.addEventListener('click',  () => this._confirmLabel(false));
    document.getElementById('btn-label-skip')?.addEventListener('click',  () => this._confirmLabel(true));
    document.getElementById('btn-label-close')?.addEventListener('click', () => this._confirmLabel(true));
    document.getElementById('label-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') this._confirmLabel(false);
    });

    // Fullscreen toggle (with exit button)
    document.getElementById('btn-fullmap').addEventListener('click', () => {
      document.body.classList.toggle('fullmap');
    });
    document.getElementById('btn-exit-fullmap')?.addEventListener('click', () => {
      document.body.classList.remove('fullmap');
    });

    // ESC key
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (document.body.classList.contains('fullmap')) {
          document.body.classList.remove('fullmap');
        } else if (MapCtrl._isDrawing()) {
          MapCtrl.cancelDraw();
        } else if (MapCtrl._activeTool === 'place-unit' || MapCtrl._activeTool === 'pin') {
          MapCtrl.setTool('select');
          UI.toolBtn('select');
        } else {
          UI.closeAllSheets();
          MapCtrl.setTool('select');
          UI.toolBtn('select');
        }
      }
    });

    // Locate / GPS
    document.getElementById('btn-locate').addEventListener('click', () => this._toggleTracking());

    // Copy MGRS
    document.getElementById('coord-chip').addEventListener('click', () => {
      const txt = document.getElementById('coord-mgrs').textContent;
      navigator.clipboard?.writeText(txt);
      UI.toast('MGRS copied: ' + txt, 'success');
    });

    // Layers
    document.getElementById('btn-layers').addEventListener('click', () => {
      UI.buildLayersSheet();
      UI.showSheet('sheet-layers');
    });

    // Roster toggle
    document.getElementById('btn-roster-toggle').addEventListener('click', () =>
      document.getElementById('panel-roster').classList.toggle('collapsed'));

    // Measure clear
    document.getElementById('btn-measure-clear').addEventListener('click', () => MapCtrl.clearMeasure());

    // (plot-grid sheet removed — replaced by pin tool)

    // Chat button
    document.getElementById('btn-chat').addEventListener('click', () => {
      if (Chat.isJoined()) {
        Chat.open();
      } else {
        UI.toast('Join a mission to use chat', 'info');
      }
    });

    // Chat send
    document.getElementById('btn-chat-send')?.addEventListener('click', () => this._sendChat());
    document.getElementById('chat-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._sendChat(); }
    });

    // Chat canned messages
    document.getElementById('chat-canned')?.addEventListener('click', e => {
      const btn = e.target.closest('.canned-btn');
      if (!btn) return;
      const input = document.getElementById('chat-input');
      if (input) { input.value = btn.dataset.msg; input.focus(); }
    });

    // Build canned message buttons
    const cannedContainer = document.getElementById('chat-canned');
    if (cannedContainer) {
      cannedContainer.innerHTML = Chat.CANNED.map(m =>
        `<button class="canned-btn" data-msg="${m.replace(/"/g,'&quot;')}">${m}</button>`
      ).join('');
    }

    // Reports menu
    document.getElementById('btn-rpt-log')?.addEventListener('click', () => {
      UI.closeSheet('sheet-reports-menu');
      Reports.openLog();
    });
    document.getElementById('btn-rpt-lace')?.addEventListener('click', () => {
      UI.closeSheet('sheet-reports-menu');
      Reports.openLACE(null);
    });
    document.getElementById('btn-rpt-ace')?.addEventListener('click', () => {
      UI.closeSheet('sheet-reports-menu');
      Reports.openACE(null);
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
    document.getElementById('btn-rpt-nbc')?.addEventListener('click', () => {
      UI.closeSheet('sheet-reports-menu');
      const c = MapCtrl.map.getCenter();
      Reports.openNBC(c.lat, c.lng);
    });

    // LACE form
    ['lace-liquid','lace-ammo','lace-equip','lace-cas'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => Reports._updateLACEBars());
    });
    document.getElementById('btn-lace-submit')?.addEventListener('click', () => Reports.submitLACE());

    // ACE form
    ['ace-ammo','ace-equip'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => Reports._updateACEBars());
    });
    document.getElementById('btn-ace-submit')?.addEventListener('click', () => Reports.submitACE());

    // NBC form
    document.getElementById('sheet-nbc')?.addEventListener('click', e => {
      const btn = e.target.closest('.nbc-type-btn');
      if (!btn) return;
      document.querySelectorAll('.nbc-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      Reports._nbcType = btn.dataset.type;
    });
    document.getElementById('btn-nbc-submit')?.addEventListener('click', () => Reports.submitNBC());

    // SPOTREP form
    document.getElementById('btn-spotrep-submit')?.addEventListener('click', () => Reports.submitSPOTREP());

    // 9-Line form
    document.getElementById('btn-9line-submit')?.addEventListener('click', () => Reports.submit9Line());

    // SITREP form
    document.getElementById('btn-sitrep-submit')?.addEventListener('click', () => Reports.submitSITREP());

    // PACE plan
    document.getElementById('btn-pace-save')?.addEventListener('click', () => App._savePACE());

    // Force status
    document.getElementById('btn-force-status-close')?.addEventListener('click', () =>
      UI.closeSheet('sheet-force-status'));

    // Symbol scale
    document.querySelectorAll('.scale-btn').forEach(btn => {
      const s = parseFloat(btn.dataset.scale);
      const cur = MapCtrl._symbolScale;
      btn.classList.toggle('active', Math.abs(s - cur) < 0.05);
      btn.addEventListener('click', () => {
        document.querySelectorAll('.scale-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        MapCtrl.setSymbolScale(s);
      });
    });

    // Pin tool — clear pins button in context if needed
    // (pins removed by long-press/right-click on them already)

    // Context menu (long-press on map)
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

    // BFT card close
    document.getElementById('btn-bft-card-close')?.addEventListener('click', () =>
      UI.closeSheet('sheet-bft-card'));

    // Init map
    MapCtrl.init();

    // Auth check
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
      if (DB.online) {
        await MapCtrl.loadMission(m.id);
      } else {
        MapCtrl.loadLocalData();
        UI.toast('Offline — using local data', 'info', 2000);
      }
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

  _savePACE() {
    const pace = {
      p: { method: document.getElementById('pace-p-method')?.value.trim(), freq: document.getElementById('pace-p-freq')?.value.trim() },
      a: { method: document.getElementById('pace-a-method')?.value.trim(), freq: document.getElementById('pace-a-freq')?.value.trim() },
      c: { method: document.getElementById('pace-c-method')?.value.trim(), freq: document.getElementById('pace-c-freq')?.value.trim() },
      e: { method: document.getElementById('pace-e-method')?.value.trim(), freq: document.getElementById('pace-e-freq')?.value.trim() },
    };
    const key = Mission.active ? `cop_pace_${Mission.current.id}` : 'cop_pace_offline';
    localStorage.setItem(key, JSON.stringify(pace));
    UI.closeSheet('sheet-pace');
    UI.toast('PACE plan saved', 'success');
  },

  _loadPACE() {
    const key  = Mission.active ? `cop_pace_${Mission.current.id}` : 'cop_pace_offline';
    const raw  = localStorage.getItem(key);
    const pace = raw ? JSON.parse(raw) : {};
    ['p','a','c','e'].forEach(l => {
      document.getElementById(`pace-${l}-method`).value = pace[l]?.method || '';
      document.getElementById(`pace-${l}-freq`).value   = pace[l]?.freq   || '';
    });
  },

  _showForceStatus() {
    const list  = document.getElementById('force-status-list');
    const units = Object.values(MapCtrl._units);
    if (!units.length) {
      list.innerHTML = '<p class="empty-msg">No units placed</p>';
      UI.showSheet('sheet-force-status');
      return;
    }
    list.innerHTML = units.map(({ data: u }) => {
      const rc    = u.redcon || 5;
      const col   = REDCON_COLORS[rc];
      const opst  = u.opstat || 'FMC';
      const opCls = opst.toLowerCase();
      const laceStr = u.lace ? `L${u.lace.l}% A${u.lace.a}% E${u.lace.e}%` : '';
      return `<div class="fstat-item">
        <div class="fstat-callsign">${_escH(u.callsign || '—')}</div>
        ${laceStr ? `<div class="fstat-lace">${laceStr}</div>` : ''}
        <div class="fstat-rc" style="color:${col};border-color:${col}">RC${rc}</div>
        <div class="fstat-opstat ${opCls}">${opst}</div>
      </div>`;
    }).join('');
    UI.showSheet('sheet-force-status');
  },

  _exportCoT() {
    const units = Object.values(MapCtrl._units);
    const now   = new Date().toISOString();
    const stale = new Date(Date.now() + 5 * 60000).toISOString();

    const typeMap = { 'H': 'a-h-G-U-C', 'N': 'a-n-G', 'U': 'a-u-G' };
    const events  = units.map(({ data: u }) => {
      const aff = (u.sidc || '')[3] === 'H' ? 'h' : (u.sidc || '')[3] === 'N' ? 'n' : (u.sidc || '')[3] === 'U' ? 'u' : 'f';
      const type = `a-${aff}-G-U-C`;
      const cs   = (u.callsign || 'UNKNOWN').replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
      return `<event version="2.0" uid="${u.id}" type="${type}" time="${u.updated_at || now}" start="${u.updated_at || now}" stale="${stale}" how="h-g-i-g-o">` +
        `<point lat="${u.lat.toFixed(6)}" lon="${u.lng.toFixed(6)}" hae="0" ce="9999" le="9999"/>` +
        `<detail><contact callsign="${cs}"/><uid Droid="${cs}"/>` +
        `<remarks>REDCON:${u.redcon||5} OPSTAT:${u.opstat||'FMC'}${u.lace ? ` LACE:${u.lace.l}/${u.lace.a}/${u.lace.c}/${u.lace.e}` : ''}</remarks>` +
        `</detail></event>`;
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<events>\n${events}\n</events>`;
    try {
      const blob = new Blob([xml], { type: 'text/xml' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `cop-cot-${new Date().toISOString().slice(0,10)}.xml`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      UI.toast(`CoT export: ${units.length} units`, 'success');
    } catch {
      navigator.clipboard?.writeText(xml).then(() => UI.toast('CoT XML copied to clipboard', 'success'));
    }
  },

  _exportPlan() {
    const units = Object.values(MapCtrl._units).map(u => ({
      id:       u.data.id,
      sidc:     u.data.sidc,
      callsign: u.data.callsign,
      lat:      u.data.lat,
      lng:      u.data.lng,
      notes:    u.data.notes,
      redcon:   u.data.redcon,
      lace:     u.data.lace,
    }));
    const graphics = Object.values(MapCtrl._graphics).map(g => ({
      id:       g.data.id,
      type:     g.data.type,
      geometry: g.data.geometry,
      style:    g.data.style,
      label:    g.data.label,
    }));
    const plan = {
      exported_at: new Date().toISOString(),
      mission: Mission.current ? { id: Mission.current.id, name: Mission.current.name } : null,
      units,
      graphics,
    };
    const json = JSON.stringify(plan, null, 2);
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `plan-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      UI.toast('Plan exported', 'success');
    } catch {
      // iOS Safari fallback: copy to clipboard
      navigator.clipboard?.writeText(json).then(() =>
        UI.toast('Plan copied to clipboard (JSON)', 'success')
      );
    }
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

        // Broadcast to BFT if mission active (max once per 15 seconds)
        if (Mission.active) {
          const now = Date.now();
          if (now - this._lastBFT > 15000) {
            this._lastBFT = now;
            // Include own-unit status if we have a unit with matching callsign
            const myUnit = Object.values(MapCtrl._units).find(u => u.data.callsign === Auth.callsign);
            const status = myUnit?.data.lace ? {
              fuel_pct: myUnit.data.lace.l,
              ammo_pct: myUnit.data.lace.a,
              opstat:   myUnit.data.opstat || 'FMC'
            } : {};
            BFT.broadcast(lat, lng, heading, speed, status);
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
