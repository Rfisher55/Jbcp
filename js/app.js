// Main application controller

const REDCON_COLORS = ['', '#f85149', '#ff8c00', '#d29922', '#3fb950', '#58a6ff'];
const REDCON_LABELS = ['', 'IMMEDIATE ACTION', 'READY TO FIGHT', '30 MIN READINESS', 'MIN ALERT', 'NORMAL'];

function _timeAgo(date) {
  const s = Math.floor((Date.now() - date) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const UI = {
  toast(msg, type = 'info', duration = 3000) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    el.style.setProperty('--toast-delay', Math.max(0, duration - 250) + 'ms');
    document.getElementById('toasts').appendChild(el);
    el.addEventListener('animationend', e => { if (e.animationName === 'toast-out') el.remove(); });
    setTimeout(() => el.remove(), duration + 300);
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
        <div class="roster-avatar">${_escH((m.callsign || '?').slice(0,2))}</div>
        <div class="roster-info">
          <div class="roster-callsign">${_escH(m.callsign || 'Unknown')}</div>
          <div class="roster-pos">${_escH(m.mgrs || '')}</div>
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
        if (MapCtrl._editUnitSymbolId) {
          const newSIDC = buildSIDC(entry.base, echelon);
          MapCtrl._updateUnit(MapCtrl._editUnitSymbolId, { sidc: newSIDC });
          MapCtrl._editUnitSymbolId = null;
          UI.closeSheet('sheet-symbols');
          UI.toast(`Symbol changed to ${entry.name}`, 'success', 2000);
          return;
        }
        if (MapCtrl._pendingLatLng) {
          // User clicked the map first, then picked a symbol — place immediately
          MapCtrl.placeUnit(entry, echelon);
          UI.closeSheet('sheet-symbols');
          UI.toast(`${entry.name} placed`, 'success', 1500);
        } else {
          MapCtrl.setActiveSIDC(entry, echelon);
          UI.closeSheet('sheet-symbols');
          UI.toast(`${entry.name} — click map to place (ESC to stop)`, 'info', 2500);
        }
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
    const mgrsStr = (isFinite(unit.lat) && isFinite(unit.lng))
      ? (toMGRS(unit.lat, unit.lng, 5) || `${unit.lat.toFixed(5)}, ${unit.lng.toFixed(5)}`)
      : '—';
    const rc      = unit.redcon || 5;
    const col     = REDCON_COLORS[rc];

    const lace    = unit.lace;
    const _lacePct = v => Math.max(0, Math.min(100, +v || 0));
    const laceHTML = lace ? `
      <div class="section-label">LACE STATUS</div>
      <div class="lace-display">
        ${['l','a','e'].map((k, i) => {
          const pct = _lacePct(lace[k]);
          return `<div class="lace-row">
            <span class="lace-key">${['L','A','E'][i]}</span>
            <div class="lace-bar-bg"><div class="lace-fill ${Reports.laceColor(pct)}" style="width:${pct}%"></div></div>
            <span class="lace-val">${pct}%</span>
          </div>`;
        }).join('')}
        <div class="lace-row">
          <span class="lace-key">C</span>
          <div class="lace-bar-bg" style="background:rgba(248,81,73,0.15)"></div>
          <span class="lace-val">${Math.max(0, +lace.c || 0)} cas</span>
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
          <div class="unit-title" id="ud-title">${_escH(unit.callsign || 'Unit')}</div>
          <div class="unit-meta">${_escH(unit.sidc)}</div>
          <div class="redcon-badge" id="ud-rcbadge"
            style="background:${col}22;border-color:${col}66;color:${col}">RC${rc} — ${REDCON_LABELS[rc]}</div>
        </div>
        <button class="btn-unit-trash" id="btn-unit-delete" title="Delete unit" aria-label="Delete unit">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9h8l1-9"/>
          </svg>
        </button>
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
        <input id="edit-callsign" type="text" value="${_escH(unit.callsign || '')}"
               maxlength="24" autocapitalize="characters" autocorrect="off" spellcheck="false">
      </div>
      <div class="field-group">
        <label for="edit-notes">Notes / Remarks</label>
        <input id="edit-notes" type="text" value="${_escH(unit.notes || '')}"
               placeholder="Optional remarks" spellcheck="false">
      </div>
      <div class="field-group" style="margin-bottom:6px">
        <label for="unit-move-mgrs" style="display:flex;justify-content:space-between;align-items:center">
          <span>Reposition Unit</span>
          <div style="display:flex;gap:4px">
            ${App._selfPos ? `<button class="btn-secondary" id="btn-unit-move-gps" style="font-size:10px;padding:2px 8px;margin:0">📍 GPS</button>` : ''}
            <button class="btn-secondary" id="btn-unit-move" style="font-size:10px;padding:2px 8px;margin:0">Move</button>
          </div>
        </label>
        <input id="unit-move-mgrs" type="text" value="${mgrsStr}" placeholder="Enter MGRS to move unit"
               autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" style="font-family:'SF Mono',monospace">
      </div>
      <dl class="detail-dl">
        <dt>MGRS</dt><dd id="ud-mgrs-copy" style="cursor:pointer;text-decoration:underline dotted" title="Tap to copy">${mgrsStr}</dd>
        ${(() => {
          const selfPos = App._selfPos;
          if (!selfPos) return '';
          const dist = MapCtrl.map?.distance(selfPos, { lat: unit.lat, lng: unit.lng });
          const brg  = MapCtrl._bearing?.(selfPos, { lat: unit.lat, lng: unit.lng });
          if (!dist || brg == null) return '';
          const distStr = dist >= 1000 ? (dist / 1000).toFixed(1) + ' km' : Math.round(dist) + ' m';
          const brgStr  = brg.toFixed(0) + '° (' + Math.round(brg * 6400 / 360) + ' mil)';
          return `<dt>From self</dt><dd>${distStr} at ${brgStr}</dd>`;
        })()}
        <dt>Lat/Lng</dt><dd>${isFinite(unit.lat) && isFinite(unit.lng) ? `${unit.lat.toFixed(5)}, ${unit.lng.toFixed(5)}` : '—'}</dd>
        <dt>Updated</dt><dd>${unit.updated_at ? _timeAgo(new Date(unit.updated_at)) : '—'}</dd>
      </dl>
      <div class="btn-row" style="margin-bottom:8px">
        <button class="btn-primary" id="btn-unit-save">Save</button>
        <button class="btn-secondary" id="btn-file-lace">LACE</button>
        <button class="btn-secondary" id="btn-file-ace">ACE</button>
      </div>
      <div class="btn-row" style="margin-bottom:8px">
        <button class="btn-secondary" id="btn-unit-fly">Go to Unit</button>
        <button class="btn-secondary" id="btn-unit-rings">Range Rings</button>
        <button class="btn-secondary" id="btn-unit-chgsym">Change Symbol</button>
      </div>
      <div class="btn-row" style="margin-bottom:8px">
        <button class="btn-secondary" id="btn-unit-dupe">Duplicate</button>
        <button class="btn-secondary" id="btn-unit-9line">9-Line MEDEVAC</button>
      </div>
      <div class="btn-row" style="margin-bottom:8px">
        <button class="btn-secondary btn-full" id="btn-unit-share">Share Status to Chat</button>
      </div>
    `;

    // Op Status selector
    let curOpStat = unit.opstat || 'FMC';
    document.getElementById('ud-mgrs-copy')?.addEventListener('click', () => {
      if (!mgrsStr || mgrsStr === '—') return;
      navigator.clipboard?.writeText(mgrsStr)
        .then(() => UI.toast('Grid copied: ' + mgrsStr, 'success', 1800))
        .catch(() => UI.toast(mgrsStr, 'info', 2000));
    });

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
      // Auto-save REDCON immediately — critical tactical status
      onEdit({ redcon: curRC, callsign: document.getElementById('edit-callsign')?.value.trim() ?? unit.callsign,
               notes: document.getElementById('edit-notes')?.value.trim() ?? unit.notes, opstat: curOpStat });
    });

    document.getElementById('btn-file-lace').addEventListener('click', () => {
      UI.closeSheet('sheet-unit');
      Reports.openLACE(unit.id, unit.lace);
    });

    document.getElementById('btn-file-ace').addEventListener('click', () => {
      UI.closeSheet('sheet-unit');
      Reports.openACE(unit.id);
    });

    document.getElementById('btn-unit-fly').addEventListener('click', () => {
      UI.closeSheet('sheet-unit');
      MapCtrl.flyToGrid(unit.lat, unit.lng);
    });

    document.getElementById('btn-unit-rings').addEventListener('click', () => {
      const added = MapCtrl.toggleRangeRings(unit.id, unit.lat, unit.lng);
      UI.closeSheet('sheet-unit');
      UI.toast(added ? 'Range rings: 1 / 3 / 5 km (tap again to remove)' : 'Range rings cleared', 'info', 2200);
    });

    document.getElementById('btn-unit-chgsym').addEventListener('click', () => {
      MapCtrl._editUnitSymbolId = unit.id;
      const s = unit.sidc || '';
      App._symFilter = s[1] === 'H' || (s.length >= 20 && s[3] === '6') ? 'H' : 'F';
      // Infer echelon from current SIDC to pre-select in picker
      let ech = '';
      if (s.length >= 20 && typeof ECHELONS_2525D !== 'undefined') {
        const code = s.slice(8, 10);
        const found = Object.entries(ECHELONS_2525D).find(([, v]) => v === code);
        ech = found ? found[0] : '';
      } else if (s.length >= 11 && typeof ECHELONS !== 'undefined') {
        const c = s[10] || '-';
        const found = Object.entries(ECHELONS).find(([, v]) => v === c);
        ech = found ? found[0] : '';
      }
      App._symEchelon = ech;
      const srch = document.getElementById('symbol-search');
      if (srch) srch.value = '';
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === App._symFilter));
      document.querySelectorAll('.ech-btn').forEach(b => b.classList.toggle('active', b.dataset.ech === ech));
      UI.buildSymbolGrid(App._symFilter, App._symEchelon);
      UI.closeSheet('sheet-unit');
      UI.showSheet('sheet-symbols');
    });

    document.getElementById('btn-unit-move').addEventListener('click', () => {
      const raw = document.getElementById('unit-move-mgrs')?.value.trim();
      if (!raw) return;
      const result = parseMGRS(raw);
      if (!result.valid) { UI.toast('Invalid MGRS grid', 'error'); return; }
      onEdit({ lat: result.lat, lng: result.lng });
      UI.closeSheet('sheet-unit');
      MapCtrl.flyToGrid(result.lat, result.lng);
      UI.toast('Unit moved', 'success', 1500);
    });

    document.getElementById('unit-move-mgrs')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btn-unit-move')?.click();
    });

    document.getElementById('btn-unit-move-gps')?.addEventListener('click', () => {
      const pos = App._selfPos;
      if (!pos) return;
      onEdit({ lat: pos.lat, lng: pos.lng });
      UI.closeSheet('sheet-unit');
      MapCtrl.flyToGrid(pos.lat, pos.lng);
      UI.toast('Unit moved to your GPS position', 'success', 2000);
    });

    document.getElementById('btn-unit-dupe').addEventListener('click', () => {
      const dupe = {
        id:         crypto.randomUUID(),
        mission_id: unit.mission_id,
        sidc:       unit.sidc,
        callsign:   (unit.callsign || 'Unit') + ' (2)',
        lat:        unit.lat + 0.002,
        lng:        unit.lng,
        notes:      unit.notes || '',
        redcon:     unit.redcon || 5,
        opstat:     unit.opstat || 'FMC',
        created_by: unit.created_by,
        updated_at: new Date().toISOString(),
      };
      MapCtrl._addUnitMarker(dupe);
      LocalStore.upsertUnit(dupe);
      if (Mission.active) DB.upsertUnit(dupe).catch(e => UI.toast('Save failed: ' + e.message, 'error'));
      UI.closeSheet('sheet-unit');
      UI.toast(`Duplicated as "${dupe.callsign}"`, 'success');
    });

    document.getElementById('btn-unit-9line').addEventListener('click', () => {
      UI.closeSheet('sheet-unit');
      Reports.open9Line(unit.lat, unit.lng);
      // Pre-fill line 2 frequency from PACE plan if available
      const pace = App._loadPACEData?.();
      if (pace?.p_freq) {
        const freqEl = document.getElementById('m9-freq');
        if (freqEl && !freqEl.value) freqEl.value = pace.p_freq;
      }
    });

    document.getElementById('btn-unit-share').addEventListener('click', () => {
      if (!Chat.isJoined()) { UI.toast('Join a mission to share', 'info'); return; }
      const cs   = String(unit.callsign || 'UNKNOWN').replace(/[|\x00-\x1f]/g, '').slice(0, 16) || 'UNKNOWN';
      const grid = (isFinite(unit.lat) && isFinite(unit.lng))
        ? (toMGRS(unit.lat, unit.lng, 5) || `${unit.lat.toFixed(4)},${unit.lng.toFixed(4)}`)
        : 'NO POS';
      const rc   = unit.redcon || 5;
      const os   = ['FMC','PMC','NMC'].includes(unit.opstat) ? unit.opstat : 'FMC';
      const laceStr = unit.lace
        ? ` FUEL:${+unit.lace.l || 0}% AMMO:${+unit.lace.a || 0}% CAS:${+unit.lace.c || 0}`
        : '';
      Chat.send(`UNIT STATUS: ${cs} @ ${grid} RC${rc}/${os}${laceStr}`);
      UI.closeSheet('sheet-unit');
      UI.toast('Status shared to chat', 'success', 2000);
    });

    document.getElementById('btn-unit-save').addEventListener('click', () => {
      document.activeElement?.blur();
      const cs    = document.getElementById('edit-callsign').value.trim();
      const notes = document.getElementById('edit-notes').value.trim();
      const updates = { notes, redcon: curRC, opstat: curOpStat };
      if (cs) {
        updates.callsign = cs;
        document.getElementById('ud-title').textContent = cs;
      }
      onEdit(updates);
      UI.closeSheet('sheet-unit');
    });

    document.getElementById('edit-callsign').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btn-unit-save').click();
    });
    document.getElementById('edit-notes').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btn-unit-save').click();
    });

    let deleteStep = 0;
    document.getElementById('btn-unit-delete').addEventListener('click', () => {
      deleteStep++;
      if (deleteStep === 1) {
        const btn = document.getElementById('btn-unit-delete');
        if (btn) { btn.classList.add('btn-unit-trash--confirm'); btn.title = 'Tap again to confirm delete'; }
        setTimeout(() => {
          deleteStep = 0;
          const b = document.getElementById('btn-unit-delete');
          if (b) { b.classList.remove('btn-unit-trash--confirm'); b.title = 'Delete unit'; }
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
            <div class="mission-card-name">${_escH(Mission.current.name)}</div>
            <div class="mission-card-meta">Code: ${_escH(Mission.current.id.slice(0,8).toUpperCase())}</div>
          </div>
          <span class="badge">Active</span>
        </div>
        <div class="btn-row" style="margin-bottom:8px">
          <button class="btn-secondary" id="btn-copy-code">Copy Join Code</button>
          <button class="btn-secondary" id="btn-share-mission">Share</button>
        </div>
        <div class="btn-row" style="margin-bottom:8px">
          <button class="btn-secondary" id="btn-export-plan">Export Plan</button>
          <button class="btn-secondary" id="btn-import-plan">Import Plan</button>
        </div>
        <div class="btn-row" style="margin-bottom:8px">
          <button class="btn-secondary btn-full btn-danger" id="btn-leave-mission">Leave Mission</button>
        </div>
        <div class="btn-row" style="margin-bottom:8px">
          <button class="btn-secondary" id="btn-pace-plan">PACE Plan</button>
          <button class="btn-secondary" id="btn-force-status">Force Status</button>
        </div>
        <div class="btn-row" style="margin-bottom:8px">
          <button class="btn-secondary" id="btn-cot-export">Export CoT</button>
          <button class="btn-secondary" id="btn-cot-import">Import CoT</button>
        </div>
        <div class="btn-row" style="margin-bottom:16px">
          <button class="btn-secondary btn-full" id="btn-unit-summary">Unit Summary (Text)</button>
        </div>
      ` : `
        <div class="btn-row" style="margin-bottom:8px">
          <button class="btn-secondary" id="btn-export-plan">Export Plan</button>
          <button class="btn-secondary" id="btn-import-plan">Import Plan</button>
        </div>
        <div class="btn-row" style="margin-bottom:8px">
          <button class="btn-secondary" id="btn-pace-plan">PACE Plan</button>
          <button class="btn-secondary" id="btn-force-status">Force Status</button>
        </div>
        <div class="btn-row" style="margin-bottom:16px">
          <button class="btn-secondary btn-full" id="btn-unit-summary">Unit Summary (Text)</button>
        </div>
      `}
      ${missions.length ? `
        <h4>Your Missions</h4>
        <div class="mission-list" id="mission-list">
          ${missions.map(m => `
            <div class="mission-card" data-id="${m.id}">
              <div class="mission-card-info">
                <div class="mission-card-name">${_escH(m.name)}</div>
                <div class="mission-card-meta">Code: ${_escH(m.id.slice(0,8).toUpperCase())}</div>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
      <div class="or-divider">Create or Join</div>
      <div class="field-group">
        <label for="new-mission-name">New Mission Name</label>
        <input id="new-mission-name" type="text" placeholder="e.g. Exercise IRON EAGLE"
               autocomplete="off" autocapitalize="words" spellcheck="false">
      </div>
      <button class="btn-primary btn-full" id="btn-create-mission" style="margin-bottom:12px">Create Mission</button>
      <div class="field-group">
        <label for="join-code">Join Code</label>
        <input id="join-code" type="text" placeholder="8-character code"
               autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false">
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
      const code = Mission.current.id.slice(0,8).toUpperCase();
      navigator.clipboard?.writeText(code)
        .then(() => UI.toast('Code copied!', 'success'))
        .catch(() => UI.toast(`Code: ${code}`, 'info'));
    });

    document.getElementById('btn-share-mission')?.addEventListener('click', () => {
      const code = Mission.current.id.slice(0,8).toUpperCase();
      const name = Mission.current.name;
      const url  = location.origin + location.pathname;
      const text = `Join mission "${name}" on Tactical COP\nCode: ${code}\n${url}`;
      if (navigator.share) {
        navigator.share({ title: `Mission: ${name}`, text }).catch(() => {});
      } else {
        navigator.clipboard?.writeText(text)
          .then(() => UI.toast('Invite text copied!', 'success'))
          .catch(() => UI.toast(`Code: ${code}`, 'info'));
      }
    });

    document.getElementById('btn-export-plan')?.addEventListener('click', () => {
      UI.closeSheet('sheet-mission');
      App._exportPlan();
    });

    document.getElementById('btn-import-plan')?.addEventListener('click', () => {
      UI.closeSheet('sheet-mission');
      App._openPlanImport();
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
          if (b) b.textContent = 'Leave Mission';
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

    document.getElementById('btn-cot-import')?.addEventListener('click', () => {
      UI.closeSheet('sheet-mission');
      App._openCotImport();
    });

    document.getElementById('btn-unit-summary')?.addEventListener('click', () => {
      UI.closeSheet('sheet-mission');
      App._exportUnitSummary();
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

    const chk = v => v ? 'checked' : '';
    const map = MapCtrl.map;
    const gridOn     = MapCtrl._grid?._vis !== false;
    const unitsOn    = map.hasLayer(MapCtrl._unitLayer);
    const graphicsOn = map.hasLayer(MapCtrl._graphicLayer);
    const bftOn      = BFT._layer ? map.hasLayer(BFT._layer) : true;
    const labelsOn   = !document.getElementById('map')?.classList.contains('hide-unit-labels');

    document.getElementById('overlay-list').innerHTML = `
      <div class="overlay-row">
        <label for="tog-grid">MGRS Grid</label>
        <label class="toggle">
          <input id="tog-grid" type="checkbox" ${chk(gridOn)}>
          <span class="toggle-track"></span>
        </label>
      </div>
      <div class="overlay-row">
        <label for="tog-units">Units</label>
        <label class="toggle">
          <input id="tog-units" type="checkbox" ${chk(unitsOn)}>
          <span class="toggle-track"></span>
        </label>
      </div>
      <div class="overlay-row">
        <label for="tog-graphics">Graphics</label>
        <label class="toggle">
          <input id="tog-graphics" type="checkbox" ${chk(graphicsOn)}>
          <span class="toggle-track"></span>
        </label>
      </div>
      <div class="overlay-row">
        <label for="tog-bft">BFT Tracks</label>
        <label class="toggle">
          <input id="tog-bft" type="checkbox" ${chk(bftOn)}>
          <span class="toggle-track"></span>
        </label>
      </div>
      <div class="overlay-row">
        <label for="tog-labels">Unit Labels</label>
        <label class="toggle">
          <input id="tog-labels" type="checkbox" ${chk(labelsOn)}>
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
    document.getElementById('tog-labels').addEventListener('change', e => {
      document.getElementById('map')?.classList.toggle('hide-unit-labels', !e.target.checked);
    });

    // Symbol scale buttons — update active state
    const curScale = MapCtrl._symbolScale;
    document.querySelectorAll('.scale-btn[data-scale]').forEach(btn => {
      btn.classList.toggle('active', Math.abs(parseFloat(btn.dataset.scale) - curScale) < 0.05);
    });

    // Map filter active state (handlers wired once in App.init)
    const mapEl2 = document.getElementById('map');
    const curFilter = mapEl2?.classList.contains('map-night') ? 'night'
                    : mapEl2?.classList.contains('map-dim')   ? 'dim' : 'off';
    ['off', 'dim', 'night'].forEach(f =>
      document.getElementById(`map-filter-${f}`)?.classList.toggle('active', f === curFilter));
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
  _selfPos:       null,
  _followGPS:     true,

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
    // Global MGRS tap-link delegate — any element with data-mgrs + mgrs-tap-link class
    document.body.addEventListener('click', e => {
      const el = e.target.closest('.mgrs-tap-link[data-mgrs]');
      if (!el) return;
      const result = parseMGRS(el.dataset.mgrs);
      if (result.valid) {
        UI.closeAllSheets();
        MapCtrl.flyToGrid(result.lat, result.lng);
      }
    });

    // Close buttons
    document.querySelectorAll('.btn-close').forEach(btn => {
      const sheet = btn.closest('.sheet');
      if (sheet) btn.addEventListener('click', () => {
        UI.closeSheet(sheet.id);
        if (sheet.id === 'sheet-symbols') {
          MapCtrl._editUnitSymbolId = null;
          // If user dismissed picker without picking, cancel place-unit mode
          if (!MapCtrl._activeSIDC) {
            MapCtrl._pendingLatLng = null;
            MapCtrl.setTool('select');
            UI.toolBtn('select');
          }
        }
        if (sheet.id === 'sheet-graphic-picker') {
          // If dismissed before picking a graphic type, cancel any started draw
          MapCtrl.cancelDraw();
        }
        if (sheet.id === 'sheet-measure') {
          MapCtrl.setTool('select');
          UI.toolBtn('select');
        }
        if (sheet.id === 'sheet-reports-menu') {
          UI.toolBtn('select');
        }
      });
    });

    // Swipe-to-close: drag down on sheet handle to dismiss (triggers same logic as ✕ button)
    document.querySelectorAll('.sheet:not(#sheet-auth) .sheet-handle').forEach(handle => {
      const sheet = handle.closest('.sheet');
      if (!sheet) return;
      let startY = 0, dragging = false;
      handle.addEventListener('touchstart', e => {
        startY   = e.touches[0].clientY;
        dragging = true;
      }, { passive: true });
      handle.addEventListener('touchmove', e => {
        if (!dragging) return;
        if (e.touches[0].clientY - startY > 60) {
          dragging = false;
          sheet.querySelector('.btn-close')?.click();
        }
      }, { passive: true });
      handle.addEventListener('touchend', () => { dragging = false; }, { passive: true });
    });

    // Auth
    document.getElementById('btn-auth-submit').addEventListener('click', () => this._handleAuthSubmit());
    document.getElementById('auth-callsign').addEventListener('keydown', e => {
      if (e.key === 'Enter') this._handleAuthSubmit();
    });

    // Mission chip
    document.getElementById('mission-chip').addEventListener('click', async () => {
      let missions = [];
      try { missions = Auth.signedIn ? await DB.getUserMissions(Auth.user.id) : []; }
      catch { UI.toast('Failed to load missions', 'error', 2500); }
      UI.showMissionSheet(missions);
      UI.showSheet('sheet-mission');
    });

    // Tool buttons
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        if (!tool) return; // skip buttons handled by their own specific listeners (e.g. goto-grid)

        if (tool === 'place-unit') {
          this._symFilter  = 'F';
          this._symEchelon = '';
          const srch = document.getElementById('symbol-search');
          if (srch) srch.value = '';
          document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === 'F'));
          document.querySelectorAll('.ech-btn').forEach(b => b.classList.toggle('active', b.dataset.ech === ''));
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

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      // Ignore when typing in an input/textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        if (e.key === 'Escape') {
          e.target.blur();
          UI.closeAllSheets();
        }
        return;
      }

      const TOOLS = { 's': 'select', 'u': 'place-unit', 'm': 'measure', 'p': 'pin',
                      'l': 'draw-line', 'a': 'draw-area' };

      if (e.key === 'Escape') {
        if (document.body.classList.contains('fullmap')) {
          document.body.classList.remove('fullmap');
        } else if (MapCtrl._isDrawing()) {
          MapCtrl.cancelDraw();
        } else if (MapCtrl._editUnitSymbolId) {
          MapCtrl._editUnitSymbolId = null;
          UI.closeSheet('sheet-symbols');
        } else if (MapCtrl._activeTool === 'place-unit' || MapCtrl._activeTool === 'pin') {
          MapCtrl.setTool('select');
          UI.toolBtn('select');
        } else {
          UI.closeAllSheets();
          MapCtrl.setTool('select');
          UI.toolBtn('select');
        }
      } else if (e.key === 'f' || e.key === 'F') {
        document.body.classList.toggle('fullmap');
      } else if (TOOLS[e.key.toLowerCase()] && !e.ctrlKey && !e.metaKey) {
        const tool = TOOLS[e.key.toLowerCase()];
        if (tool === 'place-unit') {
          App._symFilter  = 'F';
          App._symEchelon = '';
          const srch = document.getElementById('symbol-search');
          if (srch) srch.value = '';
          document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === 'F'));
          document.querySelectorAll('.ech-btn').forEach(b => b.classList.toggle('active', b.dataset.ech === ''));
          UI.buildSymbolGrid('F', '');
          UI.showSheet('sheet-symbols');
          MapCtrl.setTool('place-unit');
          UI.toolBtn('place-unit');
        } else if (tool === 'draw-line' || tool === 'draw-area') {
          MapCtrl.setTool(tool);
          UI.toolBtn(tool);
        } else {
          MapCtrl.setTool(tool);
          UI.toolBtn(tool);
          if (tool === 'measure') UI.showSheet('sheet-measure');
        }
      }
    });

    // Locate / GPS
    document.getElementById('btn-locate').addEventListener('click', () => this._toggleTracking());

    // Copy MGRS
    document.getElementById('coord-chip').addEventListener('click', () => {
      const txt = document.getElementById('coord-mgrs').textContent;
      if (!txt || txt === 'No position') { UI.toast('No GPS fix yet', 'info', 2000); return; }
      navigator.clipboard?.writeText(txt)
        .then(() => UI.toast('MGRS copied: ' + txt, 'success'))
        .catch(() => UI.toast(txt, 'info'));
    });

    // Layers
    document.getElementById('btn-layers').addEventListener('click', () => {
      UI.buildLayersSheet();
      UI.showSheet('sheet-layers');
    });

    // Roster toggle — tap button or tap backdrop (map area) to close
    const _rosterPanel   = document.getElementById('panel-roster');
    const _rosterBackdrop = document.getElementById('roster-backdrop');
    const _closeRoster = () => {
      _rosterPanel.classList.add('collapsed');
      _rosterBackdrop.classList.remove('active');
    };
    document.getElementById('btn-roster-toggle').addEventListener('click', () => {
      const nowOpen = !_rosterPanel.classList.toggle('collapsed');
      _rosterBackdrop.classList.toggle('active', nowOpen);
    });
    _rosterBackdrop.addEventListener('click', _closeRoster);
    _rosterBackdrop.addEventListener('touchend', e => {
      e.preventDefault(); _closeRoster();
    }, { passive: false });
    document.getElementById('btn-roster-close').addEventListener('click', _closeRoster);

    // Measure clear
    document.getElementById('btn-measure-clear').addEventListener('click', () => MapCtrl.clearMeasure());

    // Chat clear (two-tap confirm)
    let _chatClearStep = 0;
    document.getElementById('btn-chat-clear')?.addEventListener('click', () => {
      _chatClearStep++;
      const btn = document.getElementById('btn-chat-clear');
      if (_chatClearStep === 1) {
        if (btn) btn.textContent = 'Confirm';
        setTimeout(() => {
          _chatClearStep = 0;
          if (btn) btn.textContent = 'Clear';
        }, 3000);
      } else {
        _chatClearStep = 0;
        if (btn) btn.textContent = 'Clear';
        Chat.clearHistory();
        UI.toast('Chat history cleared', 'info', 2000);
      }
    });

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
        `<button class="canned-btn" data-msg="${_escH(m)}">${_escH(m)}</button>`
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
      const pos = App._selfPos || MapCtrl.map.getCenter();
      Reports.openSPOTREP(pos.lat, pos.lng);
    });
    document.getElementById('btn-rpt-9line')?.addEventListener('click', () => {
      UI.closeSheet('sheet-reports-menu');
      const pos = App._selfPos || MapCtrl.map.getCenter();
      Reports.open9Line(pos.lat, pos.lng);
    });
    document.getElementById('btn-rpt-sitrep')?.addEventListener('click', () => {
      UI.closeSheet('sheet-reports-menu');
      Reports.openSITREP();
    });
    document.getElementById('btn-rpt-nbc')?.addEventListener('click', () => {
      UI.closeSheet('sheet-reports-menu');
      const pos = App._selfPos || MapCtrl.map.getCenter();
      Reports.openNBC(pos.lat, pos.lng);
    });

    document.getElementById('btn-reports-export-all')?.addEventListener('click', () =>
      Reports.exportAll());

    document.getElementById('reports-log-filter')?.addEventListener('click', e => {
      const btn = e.target.closest('.rpt-filter-btn');
      if (!btn) return;
      document.querySelectorAll('.rpt-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      Reports._logFilter = btn.dataset.type || 'ALL';
      Reports._renderLog();
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
    document.getElementById('btn-nbcdtg-now')?.addEventListener('click', () => {
      const el = document.getElementById('nbc-dtg');
      if (el) el.value = Reports._dtg();
    });

    // SPOTREP form
    document.getElementById('btn-spotrep-submit')?.addEventListener('click', () => Reports.submitSPOTREP());
    document.getElementById('btn-spotdtg-now')?.addEventListener('click', () => {
      const el = document.getElementById('spot-dtg');
      if (el) el.value = Reports._dtg();
    });

    // 9-Line form
    document.getElementById('btn-9line-submit')?.addEventListener('click', () => Reports.submit9Line());

    // SITREP form
    document.getElementById('btn-sitrep-submit')?.addEventListener('click', () => Reports.submitSITREP());
    document.getElementById('btn-dtg-now')?.addEventListener('click', () => {
      const el = document.getElementById('sit-dtg');
      if (el) el.value = Reports._dtg();
    });
    document.getElementById('btn-sitrep-autofill')?.addEventListener('click', () => {
      const units = Object.values(MapCtrl._units).map(u => u.data);
      const friendly = units
        .filter(u => {
          const s = u.sidc || '';
          return s[1] === 'F' || s[1] === 'A' || (s.length >= 20 && s[3] === '3');
        })
        .map(u => `${u.callsign || 'UNKNOWN'} RC${u.redcon || 5}/${u.opstat || 'FMC'}`)
        .join(', ');
      const el = document.getElementById('sit-friendly');
      if (el && friendly) el.value = friendly;

      // Auto-fill enemy situation from recent SPOTREPs
      const enemyEl = document.getElementById('sit-enemy');
      if (enemyEl && !enemyEl.value) {
        const rpts = LocalStore.getReports()
          .filter(r => r.type === 'SPOTREP')
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(0, 3)
          .map(r => `${r.data?.size || ''} ${r.data?.activity || ''} @ ${r.mgrs || ''}`.trim());
        if (rpts.length) enemyEl.value = rpts.join(' / ');
      }
    });

    // PACE plan
    document.getElementById('btn-pace-save')?.addEventListener('click', () => App._savePACE());

    // Force status — close + share + tap unit to fly
    document.getElementById('btn-force-status-close')?.addEventListener('click', () => {
      document.getElementById('fstat-filter').value = '';
      UI.closeSheet('sheet-force-status');
    });
    document.getElementById('fstat-filter')?.addEventListener('input', () => App._showForceStatus());
    document.getElementById('btn-fstat-share')?.addEventListener('click', () => {
      if (!Chat.isJoined()) { UI.toast('Join a mission to share', 'info'); return; }
      const safeCs = s => String(s || '?').replace(/[|\x00-\x1f]/g, '').slice(0, 16) || '?';
      const units = Object.values(MapCtrl._units)
        .sort((a, b) => (a.data.redcon || 5) - (b.data.redcon || 5))
        .map(({ data: u }) => `${safeCs(u.callsign)} RC${u.redcon || 5}/${u.opstat || 'FMC'}`)
        .join(' | ');
      if (units) { Chat.send('FORCE STATUS: ' + units); UI.toast('Force status shared to chat', 'success'); }
    });
    document.getElementById('btn-fstat-export')?.addEventListener('click', () => {
      App._exportUnitSummary();
    });

    document.querySelectorAll('.btn-rc-bulk').forEach(btn => {
      btn.addEventListener('click', () => {
        const rc = parseInt(btn.dataset.rc, 10);
        const units = Object.values(MapCtrl._units);
        if (!units.length) { UI.toast('No units to update', 'info'); return; }
        units.forEach(({ data: u }) => {
          MapCtrl._updateUnit(u.id, { redcon: rc });
        });
        UI.toast(`All units set to REDCON ${rc}`, 'success');
        App._showForceStatus();
      });
    });

    document.getElementById('force-status-list')?.addEventListener('click', e => {
      // mgrs-tap-link clicks are handled by the body delegate — don't double-handle
      if (e.target.closest('.mgrs-tap-link')) return;
      const item = e.target.closest('[data-uid]');
      if (!item) return;
      const entry = MapCtrl._units[item.dataset.uid];
      if (!entry) return;
      UI.closeSheet('sheet-force-status');
      MapCtrl._openUnitDetail(item.dataset.uid);
      MapCtrl.flyToGrid(entry.data.lat, entry.data.lng);
    });

    // Symbol scale (only buttons with explicit data-scale; map filter + stale buttons share scale-btn class)
    document.querySelectorAll('.scale-btn[data-scale]').forEach(btn => {
      const s = parseFloat(btn.dataset.scale);
      const cur = MapCtrl._symbolScale;
      btn.classList.toggle('active', Math.abs(s - cur) < 0.05);
      btn.addEventListener('click', () => {
        document.querySelectorAll('.scale-btn[data-scale]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        MapCtrl.setSymbolScale(s);
      });
    });

    // Map filter buttons (one-time setup; buildLayersSheet only updates active state)
    ['off', 'dim', 'night'].forEach(f => {
      document.getElementById(`map-filter-${f}`)?.addEventListener('click', () => {
        const mapEl = document.getElementById('map');
        mapEl.classList.remove('map-dim', 'map-night');
        document.body.classList.remove('ui-dim', 'ui-night');
        if (f !== 'off') {
          mapEl.classList.add(`map-${f}`);
          document.body.classList.add(`ui-${f}`);
        }
        ['off', 'dim', 'night'].forEach(x =>
          document.getElementById(`map-filter-${x}`)?.classList.toggle('active', x === f));
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
    document.getElementById('ctx-copy-grid')?.addEventListener('click', () => {
      UI.closeSheet('sheet-context');
      const ll   = MapCtrl._ctxLatLng;
      const mgrs = ll ? (toMGRS(ll.lat, ll.lng, 5) || `${ll.lat.toFixed(5)},${ll.lng.toFixed(5)}`) : '';
      navigator.clipboard?.writeText(mgrs)
        .then(() => UI.toast('Grid copied: ' + mgrs, 'success', 2000))
        .catch(() => UI.toast('Grid: ' + mgrs, 'info', 2000));
    });
    document.getElementById('ctx-nbc')?.addEventListener('click', () => {
      UI.closeSheet('sheet-context');
      const ll = MapCtrl._ctxLatLng;
      if (ll) Reports.openNBC(ll.lat, ll.lng);
    });

    document.getElementById('ctx-goto-grid')?.addEventListener('click', () => {
      UI.closeSheet('sheet-context');
      const input = document.getElementById('goto-grid-input');
      if (input) input.value = '';
      document.getElementById('goto-grid-note').textContent = '';
      UI.showSheet('sheet-goto-grid');
      setTimeout(() => input?.focus(), 320);
    });

    document.getElementById('btn-goto-close')?.addEventListener('click', () =>
      UI.closeSheet('sheet-goto-grid'));

    document.getElementById('btn-goto-go')?.addEventListener('click', () => {
      const raw = document.getElementById('goto-grid-input')?.value?.trim();
      if (!raw) return;

      // First try MGRS
      const result = parseMGRS(raw);
      if (result.valid) {
        if (result.note) document.getElementById('goto-grid-note').textContent = result.note;
        UI.closeSheet('sheet-goto-grid');
        MapCtrl.flyToGrid(result.lat, result.lng);
        return;
      }

      // Then try fuzzy unit callsign search
      const query = raw.toUpperCase();
      const matches = Object.values(MapCtrl._units)
        .filter(u => (u.data.callsign || '').toUpperCase().includes(query))
        .sort((a, b) => {
          const acs = (a.data.callsign || '').toUpperCase();
          const bcs = (b.data.callsign || '').toUpperCase();
          if (acs === query && bcs !== query) return -1;
          if (bcs === query && acs !== query) return 1;
          return acs.indexOf(query) - bcs.indexOf(query);
        });

      if (matches.length === 1) {
        const u = matches[0].data;
        UI.closeSheet('sheet-goto-grid');
        MapCtrl.flyToGrid(u.lat, u.lng);
        UI.toast(`Flying to ${u.callsign}`, 'info', 1500);
        return;
      }
      if (matches.length > 1) {
        const first = matches[0].data;
        const names = matches.slice(0, 3).map(u => u.data.callsign).join(', ');
        UI.closeSheet('sheet-goto-grid');
        MapCtrl.flyToGrid(first.lat, first.lng);
        UI.toast(`${matches.length} matches — flying to ${first.callsign} (${names})`, 'info', 3500);
        return;
      }

      document.getElementById('goto-grid-note').textContent = 'No unit found — try full MGRS (e.g. 38SMB12345678)';
    });

    document.getElementById('goto-grid-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btn-goto-go')?.click();
    });

    document.getElementById('btn-goto-grid-toolbar')?.addEventListener('click', () => {
      const input = document.getElementById('goto-grid-input');
      if (input) input.value = '';
      document.getElementById('goto-grid-note').textContent = '';
      UI.showSheet('sheet-goto-grid');
      setTimeout(() => input?.focus(), 320);
    });

    // BFT card close
    document.getElementById('btn-bft-card-close')?.addEventListener('click', () =>
      UI.closeSheet('sheet-bft-card'));

    // BFT card MGRS tap → copy to clipboard (Fly To button handles navigation)
    document.getElementById('bft-card-mgrs')?.addEventListener('click', () => {
      const mgrs = document.getElementById('bft-card-mgrs')?.textContent;
      if (!mgrs || mgrs === '—') return;
      navigator.clipboard?.writeText(mgrs)
        .then(() => UI.toast('Grid copied: ' + mgrs, 'success', 1800))
        .catch(() => UI.toast(mgrs, 'info', 2500));
    });

    // Settings
    document.getElementById('btn-settings')?.addEventListener('click', () => {
      document.getElementById('settings-callsign').value = Auth.callsign || '';
      const cur = BFT.STALE_MS;
      document.querySelectorAll('.scale-btn[data-stale]').forEach(b =>
        b.classList.toggle('active', +b.dataset.stale === cur));
      // Populate AO fields from saved or default
      const savedAO = App._loadSavedAO();
      document.getElementById('settings-ao-name').value = savedAO.name || AO.name || '';
      const _c = Array.isArray(savedAO.center) ? savedAO.center : AO.center;
      const aoCenter = toMGRS(_c[0], _c[1], 5) || '';
      document.getElementById('settings-ao-mgrs').value = aoCenter;
      UI.showSheet('sheet-settings');
    });
    document.getElementById('btn-settings-close')?.addEventListener('click', () =>
      UI.closeSheet('sheet-settings'));
    document.getElementById('btn-settings-callsign-save')?.addEventListener('click', () => {
      const cs = document.getElementById('settings-callsign')?.value.trim()
        .replace(/\s+/g, '-').toUpperCase();
      if (!cs) return;
      Auth.callsign = cs;
      Auth._save();
      UI.toast('Callsign updated to ' + cs, 'success');
      UI.closeSheet('sheet-settings');
    });
    document.getElementById('settings-callsign')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btn-settings-callsign-save')?.click();
    });
    document.getElementById('stale-bar')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-stale]');
      if (!btn) return;
      const ms = +btn.dataset.stale;
      BFT.STALE_MS = ms;
      try { localStorage.setItem('cop_bft_stale', String(ms)); } catch {}
      document.querySelectorAll('.scale-btn[data-stale]').forEach(b =>
        b.classList.toggle('active', +b.dataset.stale === ms));
    });
    document.getElementById('btn-ao-use-map')?.addEventListener('click', () => {
      const c    = MapCtrl.map?.getCenter();
      if (!c) return;
      const mgrs = toMGRS(c.lat, c.lng, 5) || '';
      document.getElementById('settings-ao-mgrs').value = mgrs;
    });
    document.getElementById('btn-ao-save')?.addEventListener('click', () => {
      const name = document.getElementById('settings-ao-name')?.value.trim();
      const raw  = document.getElementById('settings-ao-mgrs')?.value.trim();
      if (!raw) { UI.toast('Enter a center MGRS coordinate', 'error'); return; }
      const result = parseMGRS(raw);
      if (!result.valid) { UI.toast('Invalid MGRS — enter a full grid like 16TDL50005000', 'error'); return; }
      // Extract 100km square prefix from full MGRS string
      const sq = raw.replace(/\s+/g, '').toUpperCase().match(/^(\d{1,2}[C-HJ-NP-X][A-Z]{2})/)?.[1];
      if (!sq) { UI.toast('Could not determine 100km square from MGRS', 'error'); return; }
      const aoData = { name: name || AO.name, center: [result.lat, result.lng], mgrs100k: sq, zoom: AO.zoom };
      try { localStorage.setItem('cop_ao', JSON.stringify(aoData)); } catch {}
      Object.assign(AO, aoData);
      UI.toast(`AO set: ${name || aoData.name} (${sq})`, 'success');
    });
    document.getElementById('settings-ao-mgrs')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btn-ao-save')?.click();
    });

    document.getElementById('btn-clear-reports')?.addEventListener('click', () => {
      MapCtrl._reportLayer?.clearLayers();
      LocalStore.clearReports?.();
      UI.toast('Report markers cleared', 'info');
    });
    document.getElementById('btn-clear-units')?.addEventListener('click', () => {
      if (!confirm('Remove all local units from map? Cannot be undone.')) return;
      MapCtrl.clearRangeRings();
      MapCtrl._unitLayer?.clearLayers();
      MapCtrl._units = {};
      MapCtrl.updateUnitCount();
      LocalStore._set('cop_units', []);
      UI.toast('All units cleared', 'info');
    });
    document.getElementById('btn-clear-all-data')?.addEventListener('click', () => {
      if (!confirm('Delete all local data? This cannot be undone.')) return;
      localStorage.clear();
      HHour.clear();
      UI.toast('Local data cleared — reload to restart', 'info', 5000);
    });

    // Restore BFT stale timeout from settings
    const savedStale = parseInt(localStorage.getItem('cop_bft_stale'), 10);
    if (savedStale > 0) BFT.STALE_MS = savedStale;

    // H-Hour timer
    document.getElementById('hhour-chip')?.addEventListener('click', () => {
      const cur = HHour.getTime();
      if (cur) {
        const d = new Date(cur);
        document.getElementById('hhour-time').value =
          `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      }
      UI.showSheet('sheet-hhour');
    });
    document.getElementById('btn-hhour-close')?.addEventListener('click', () => UI.closeSheet('sheet-hhour'));
    document.getElementById('btn-hhour-set')?.addEventListener('click', () => {
      const val = document.getElementById('hhour-time').value;
      if (!val) return;
      const [h, m] = val.split(':').map(Number);
      if (!isFinite(h) || !isFinite(m)) { UI.toast('Invalid time', 'error'); return; }
      const t = new Date();
      t.setHours(h, m, 0, 0);
      if (t < Date.now()) t.setDate(t.getDate() + 1);
      HHour.set(t.getTime());
      UI.closeSheet('sheet-hhour');
      UI.toast(`H-Hour set: ${val}`, 'success');
    });
    document.getElementById('btn-hhour-clear')?.addEventListener('click', () => {
      HHour.clear();
      UI.closeSheet('sheet-hhour');
    });
    HHour.init();

    // Detect OTP / magic-link sign-in completing while app is already open
    DB.onAuthChange(async (event, session) => {
      if (event !== 'SIGNED_IN' || !session?.user) return;
      if (!document.getElementById('sheet-auth')?.classList.contains('hidden')) {
        // We're on the auth screen — complete sign-in
        Auth.user     = session.user;
        Auth.callsign = session.user.user_metadata?.callsign || Auth.callsign || 'UNKNOWN';
        Auth._save();
        UI.closeSheet('sheet-auth');
        await App._postAuth();
      }
    });

    // Apply saved AO settings before map init (AO.center/zoom used as fallback start position)
    const savedAO = App._loadSavedAO();
    Object.assign(AO, savedAO);

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
        btn.disabled = false;
        btn.textContent = 'Resend →';
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
        try {
          await MapCtrl.loadMission(m.id);
        } catch (e) {
          // Mission may have been deleted; fall back to local data
          MapCtrl.loadLocalData();
          UI.toast('Mission unavailable — using local data', 'info', 3000);
        }
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
    MapCtrl.loadMission(m.id).catch(() => {
      MapCtrl.loadLocalData();
      UI.toast('Mission sync failed — using local data', 'info', 3000);
    });
    BFT.joinMission(m.id);
    Chat.join(m.id);
  },

  _savePACE() {
    const pace = {
      p: { method: document.getElementById('pace-p-method')?.value.trim(), freq: document.getElementById('pace-p-freq')?.value.trim() },
      a: { method: document.getElementById('pace-a-method')?.value.trim(), freq: document.getElementById('pace-a-freq')?.value.trim() },
      c: { method: document.getElementById('pace-c-method')?.value.trim(), freq: document.getElementById('pace-c-freq')?.value.trim() },
      e: { method: document.getElementById('pace-e-method')?.value.trim(), freq: document.getElementById('pace-e-freq')?.value.trim() },
    };
    const key = Mission.active ? `cop_pace_${Mission.current.id}` : 'cop_pace_offline';
    try { localStorage.setItem(key, JSON.stringify(pace)); } catch {}
    UI.closeSheet('sheet-pace');
    UI.toast('PACE plan saved', 'success');
  },

  _loadPACE() {
    const key  = Mission.active ? `cop_pace_${Mission.current.id}` : 'cop_pace_offline';
    let pace = {};
    try { pace = JSON.parse(localStorage.getItem(key) || '{}'); } catch {}
    ['p','a','c','e'].forEach(l => {
      const mEl = document.getElementById(`pace-${l}-method`);
      const fEl = document.getElementById(`pace-${l}-freq`);
      if (mEl) mEl.value = pace[l]?.method || '';
      if (fEl) fEl.value = pace[l]?.freq   || '';
    });
  },

  _loadPACEData() {
    try {
      const key = Mission.active ? `cop_pace_${Mission.current.id}` : 'cop_pace_offline';
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const pace = JSON.parse(raw);
      return { p_freq: pace.p?.freq || '', p_method: pace.p?.method || '' };
    } catch { return null; }
  },

  _loadSavedAO() {
    try {
      const raw = localStorage.getItem('cop_ao');
      if (!raw) return { name: AO.name, center: AO.center, mgrs100k: AO.mgrs100k, zoom: AO.zoom };
      return JSON.parse(raw);
    } catch { return { name: AO.name, center: AO.center, mgrs100k: AO.mgrs100k, zoom: AO.zoom }; }
  },

  _showForceStatus() {
    const list = document.getElementById('force-status-list');
    if (!list) return;
    const allUnits = Object.values(MapCtrl._units)
      .sort((a, b) => (a.data.redcon || 5) - (b.data.redcon || 5));
    if (!allUnits.length) {
      list.innerHTML = '<p class="empty-msg">No units placed</p>';
      const summaryEl = document.getElementById('fstat-summary');
      if (summaryEl) summaryEl.innerHTML = '';
      UI.showSheet('sheet-force-status');
      return;
    }

    // REDCON summary always reflects full force (not filtered)
    const units    = allUnits;
    const rcCounts = [1,2,3,4,5].map(r => units.filter(u => (u.data.redcon || 5) === r).length);
    const rcBar = `<div class="fstat-rc-summary">${
      [1,2,3,4,5].map((r, i) => rcCounts[i] > 0
        ? `<span style="background:${REDCON_COLORS[r]}22;border:1px solid ${REDCON_COLORS[r]}66;color:${REDCON_COLORS[r]}">${rcCounts[i]}×RC${r}</span>`
        : ''
      ).join('')
    }</div>`;

    // LACE aggregate
    const withLace = units.filter(u => u.data.lace);
    const laceBar = withLace.length ? (() => {
      const finiteNum = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
      const fuelVals = withLace.map(u => finiteNum(u.data.lace.l)).filter(v => v !== null);
      const ammoVals = withLace.map(u => finiteNum(u.data.lace.a)).filter(v => v !== null);
      if (!fuelVals.length && !ammoVals.length) return '';
      const avgFuel = fuelVals.length ? Math.round(fuelVals.reduce((s, v) => s + v, 0) / fuelVals.length) : '—';
      const avgAmmo = ammoVals.length ? Math.round(ammoVals.reduce((s, v) => s + v, 0) / ammoVals.length) : '—';
      const minFuel = fuelVals.length ? Math.min(...fuelVals) : '—';
      const minAmmo = ammoVals.length ? Math.min(...ammoVals) : '—';
      return `<div class="fstat-lace-agg">Avg L:${avgFuel}% A:${avgAmmo}% · Min L:${minFuel}% A:${minAmmo}%</div>`;
    })() : '';

    const summaryEl = document.getElementById('fstat-summary');
    if (summaryEl) summaryEl.innerHTML = rcBar + laceBar;

    const query = (document.getElementById('fstat-filter')?.value || '').toUpperCase().trim();
    const displayUnits = query
      ? allUnits.filter(u => (u.data.callsign || '').toUpperCase().includes(query))
      : allUnits;

    if (!displayUnits.length) {
      list.innerHTML = '<p class="empty-msg">No units match filter</p>';
      UI.showSheet('sheet-force-status');
      return;
    }

    list.innerHTML = displayUnits.map(({ data: u }) => {
      const rc    = Math.max(1, Math.min(5, +u.redcon || 5));
      const col   = REDCON_COLORS[rc];
      const opst  = ['FMC','PMC','NMC'].includes(u.opstat) ? u.opstat : 'FMC';
      const laceStr = u.lace
        ? `L${+u.lace.l || 0}% A${+u.lace.a || 0}% E${+u.lace.e || 0}%`
        : '';
      const mgrs    = (isFinite(u.lat) && isFinite(u.lng)) ? (toMGRS(u.lat, u.lng, 5) || `${u.lat.toFixed(4)},${u.lng.toFixed(4)}`) : '—';
      const ago     = u.updated_at ? _timeAgo(new Date(u.updated_at)) : '';
      const isStale = u.updated_at && (Date.now() - new Date(u.updated_at).getTime()) > 3600000;
      return `<div class="fstat-item${isStale ? ' is-stale' : ''}" data-uid="${_escH(u.id)}">
        <div class="fstat-callsign">${_escH(u.callsign || '—')}</div>
        <div class="fstat-grid mgrs-tap-link" data-mgrs="${_escH(mgrs)}">${_escH(mgrs)}</div>
        ${laceStr ? `<div class="fstat-lace">${laceStr}</div>` : ''}
        ${isStale ? '<div class="fstat-stale-badge">STALE</div>' : (ago ? `<div class="fstat-ago">${_escH(ago)}</div>` : '')}
        <div class="fstat-rc" style="color:${col};border-color:${col}">RC${rc}</div>
        <div class="fstat-opstat ${opst.toLowerCase()}">${opst}</div>
      </div>`;
    }).join('');
    UI.showSheet('sheet-force-status');
  },

  _exportCoT() {
    const units = Object.values(MapCtrl._units);
    const now   = new Date().toISOString();
    const stale = new Date(Date.now() + 5 * 60000).toISOString();

    const xmlEsc = v => String(v).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
    const eventArr = units.map(({ data: u }) => {
      const s = u.sidc || '';
      let aff;
      if (s.length <= 15) {
        aff = s[1] === 'H' ? 'h' : s[1] === 'N' ? 'n' : s[1] === 'U' ? 'u' : 'f';
      } else {
        aff = s[3] === '6' ? 'h' : s[3] === '4' ? 'n' : s[3] === '1' ? 'u' : 'f';
      }
      const type = `a-${aff}-G-U-C`;
      if (!isFinite(u.lat) || !isFinite(u.lng)) return null;
      const cs     = xmlEsc(u.callsign || 'UNKNOWN');
      const sidc   = xmlEsc(u.sidc || '');
      const opstat = xmlEsc(u.opstat || 'FMC');
      const redcon = Number.isInteger(u.redcon) ? u.redcon : 5;
      const laceStr = u.lace
        ? ` LACE:${+u.lace.l|0}/${+u.lace.a|0}/${+u.lace.c|0}/${+u.lace.e|0}`
        : '';
      return `<event version="2.0" uid="${xmlEsc(u.id)}" type="${type}" time="${u.updated_at || now}" start="${u.updated_at || now}" stale="${stale}" how="h-g-i-g-o">` +
        `<point lat="${u.lat.toFixed(6)}" lon="${u.lng.toFixed(6)}" hae="0" ce="9999" le="9999"/>` +
        `<detail sidc="${sidc}"><contact callsign="${cs}"/><uid Droid="${cs}"/>` +
        `<remarks>REDCON:${redcon} OPSTAT:${opstat}${laceStr}</remarks>` +
        `</detail></event>`;
    }).filter(Boolean);
    const events = eventArr.join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<events>\n${events}\n</events>`;
    try {
      const blob = new Blob([xml], { type: 'text/xml' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `cop-cot-${new Date().toISOString().slice(0,10)}.xml`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      UI.toast(`CoT export: ${eventArr.length} units`, 'success');
    } catch {
      navigator.clipboard?.writeText(xml)
        .then(() => UI.toast('CoT XML copied to clipboard', 'success'))
        .catch(() => {
          try { window.open('data:text/xml;charset=utf-8,' + encodeURIComponent(xml)); }
          catch { UI.toast('Export failed — try again', 'error'); }
        });
    }
  },

  _exportUnitSummary() {
    const units = Object.values(MapCtrl._units);
    if (!units.length) { UI.toast('No units on map', 'info'); return; }

    const dtg = (() => {
      const d = new Date();
      const dd  = String(d.getUTCDate()).padStart(2, '0');
      const hh  = String(d.getUTCHours()).padStart(2, '0');
      const mm  = String(d.getUTCMinutes()).padStart(2, '0');
      const mon = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getUTCMonth()];
      const yr  = String(d.getUTCFullYear()).slice(-2);
      return `${dd}${hh}${mm}Z${mon}${yr}`;
    })();

    const msnName = Mission.active && Mission.current ? Mission.current.name : AO.name;
    const header = `UNIT SUMMARY — ${msnName.toUpperCase()} DTG ${dtg}\n` + '='.repeat(40) + '\n';

    const lines = units
      .sort((a, b) => (a.data.redcon || 5) - (b.data.redcon || 5))
      .map(({ data: u }) => {
        const cs    = String(u.callsign || 'UNKNOWN').toUpperCase();
        const mgrs  = (isFinite(u.lat) && isFinite(u.lng)) ? (toMGRS(u.lat, u.lng, 5) || `${u.lat.toFixed(4)}N ${u.lng.toFixed(4)}E`) : 'NO POS';
        const rc    = `RC${u.redcon || 5}`;
        const os    = u.opstat || 'FMC';
        const fuel  = u.lace?.l  != null ? ` FUEL:${u.lace.l}%`   : '';
        const ammo  = u.lace?.a  != null ? ` AMMO:${u.lace.a}%`   : '';
        const cas   = u.lace?.c  != null ? ` CAS:${u.lace.c}`     : '';
        const notes = u.notes && u.notes !== 'Imported from CoT' ? ` // ${u.notes.slice(0, 60)}` : '';
        return `${cs.padEnd(12)} ${mgrs.padEnd(15)} ${rc} ${os}${fuel}${ammo}${cas}${notes}`;
      });

    const footer = '\n' + '='.repeat(40) + `\n${lines.length} UNIT${lines.length !== 1 ? 'S' : ''} TOTAL`;
    const text = header + lines.join('\n') + footer;

    navigator.clipboard?.writeText(text)
      .then(() => UI.toast(`Unit summary copied (${lines.length} units)`, 'success'))
      .catch(() => {
        // Fallback: download as .txt
        const blob = new Blob([text], { type: 'text/plain' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = `unit-summary-${new Date().toISOString().slice(0,10)}.txt`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        UI.toast(`Unit summary downloaded (${lines.length} units)`, 'success');
      });
  },

  _openCotImport() {
    const fi = document.createElement('input');
    fi.type   = 'file';
    fi.accept = '.xml,.cot';
    fi.style.display = 'none';
    const cleanup = () => { if (fi.parentNode) fi.remove(); };
    fi.addEventListener('change', () => {
      const file = fi.files[0];
      cleanup();
      if (!file) return;
      const reader = new FileReader();
      reader.onload  = e => this._parseCot(e.target.result);
      reader.onerror = () => UI.toast('File read error — try again', 'error');
      reader.readAsText(file);
    });
    fi.addEventListener('cancel', cleanup);
    setTimeout(cleanup, 5 * 60 * 1000);
    document.body.appendChild(fi);
    fi.click();
    UI.toast('Select a CoT XML or .cot file', 'info', 2500);
  },

  _parseCot(xmlStr) {
    try {
      const parser = new DOMParser();
      const doc    = parser.parseFromString(xmlStr, 'text/xml');
      const events = Array.from(doc.querySelectorAll('event'));
      if (!events.length) { UI.toast('No CoT events found in file', 'error'); return; }

      const COT_AFFIL = { f: 'SFGPUC-----', h: 'SHGPUC-----', n: 'SNGPUC-----', u: 'SUGPUC-----' };
      let placed = 0, updated = 0;

      MapCtrl._batchLoading = true;
      try {
        events.forEach(ev => {
          const type = ev.getAttribute('type') || '';
          // Import ground units (a-*-G-*) and skip non-unit events
          if (!type.startsWith('a-') || !type.includes('-G-')) return;

          const pt  = ev.querySelector('point');
          if (!pt) return;
          const lat = parseFloat(pt.getAttribute('lat'));
          const lng = parseFloat(pt.getAttribute('lon') || pt.getAttribute('lng'));
          if (!isFinite(lat) || !isFinite(lng)) return;

          const detail   = ev.querySelector('detail');
          const contact  = detail?.querySelector('contact');
          const callsign = contact?.getAttribute('callsign') || ev.getAttribute('uid') || 'IMPORT';

          // Prefer explicit sidc attribute (ATAK / JBC-P producers set this)
          const sidcAttr = detail?.querySelector('[sidc]')?.getAttribute('sidc') ||
                           detail?.getAttribute('sidc');
          let sidc;
          if (sidcAttr && sidcAttr.length >= 10) {
            sidc = sidcAttr;
          } else {
            const aff = type.split('-')[1] || 'f';
            sidc = COT_AFFIL[aff] || COT_AFFIL.f;
          }

          // Parse optional REDCON/OPSTAT/LACE from remarks
          const remarks  = detail?.querySelector('remarks')?.textContent || '';
          const rcMatch  = remarks.match(/REDCON:(\d)/);
          const osMatch  = remarks.match(/OPSTAT:(FMC|PMC|NMC)/);
          const laceMatch = remarks.match(/LACE:(\d+)\/(\d+)\/([^/]+)\/(\d+)/);

          const uid = ev.getAttribute('uid') || crypto.randomUUID();
          const existing = MapCtrl._units[uid];

          const unit = {
            id:         uid,
            mission_id: Mission.active ? Mission.current.id : null,
            sidc,
            callsign:   callsign.trim().slice(0, 24),
            lat, lng,
            notes:      existing ? existing.data.notes : 'Imported from CoT',
            redcon:     rcMatch ? Math.max(1, Math.min(5, parseInt(rcMatch[1], 10))) : (existing?.data.redcon || 5),
            opstat:     osMatch ? osMatch[1] : (existing?.data.opstat || 'FMC'),
            updated_at: ev.getAttribute('time') || new Date().toISOString(),
            ...(laceMatch ? { lace: {
              l: Math.max(0, Math.min(100, parseInt(laceMatch[1],10)||0)),
              a: Math.max(0, Math.min(100, parseInt(laceMatch[2],10)||0)),
              c: Math.max(0,              parseInt(laceMatch[3],10)||0),
              e: Math.max(0, Math.min(100, parseInt(laceMatch[4],10)||0)),
            } } : {}),
          };

          if (existing) {
            MapCtrl._updateUnit(uid, unit);
            updated++;
          } else {
            MapCtrl._addUnitMarker(unit);
            if (Mission.active) DB.upsertUnit(unit).catch(() => {});
            placed++;
          }
          LocalStore.upsertUnit(unit);
        });
      } finally {
        MapCtrl._batchLoading = false;
        MapCtrl.updateUnitCount();
      }

      const msg = [placed && `${placed} new`, updated && `${updated} updated`].filter(Boolean).join(', ');
      UI.toast(`CoT import: ${msg || 'no changes'}`, 'success');
    } catch(e) {
      UI.toast('CoT parse error: ' + e.message, 'error');
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
      opstat:   u.data.opstat,
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
      navigator.clipboard?.writeText(json)
        .then(() => UI.toast('Plan copied to clipboard (JSON)', 'success'))
        .catch(() => {
          try { window.open('data:application/json;charset=utf-8,' + encodeURIComponent(json)); }
          catch { UI.toast('Export failed — try again', 'error'); }
        });
    }
  },

  _openPlanImport() {
    const fi = document.createElement('input');
    fi.type = 'file'; fi.accept = '.json'; fi.style.display = 'none';
    const cleanup = () => { if (fi.parentNode) fi.remove(); };
    fi.addEventListener('change', () => {
      const file = fi.files[0];
      cleanup();
      if (!file) return;
      const reader = new FileReader();
      reader.onload  = e => this._parsePlan(e.target.result);
      reader.onerror = () => UI.toast('File read error — try again', 'error');
      reader.readAsText(file);
    });
    fi.addEventListener('cancel', cleanup);
    setTimeout(cleanup, 5 * 60 * 1000);
    document.body.appendChild(fi);
    fi.click();
    UI.toast('Select a plan .json file', 'info', 2500);
  },

  _parsePlan(jsonStr) {
    try {
      const plan = JSON.parse(jsonStr);
      if (!plan || typeof plan !== 'object') throw new Error('Invalid plan file');

      const units    = Array.isArray(plan.units)    ? plan.units    : [];
      const graphics = Array.isArray(plan.graphics) ? plan.graphics : [];

      let placed = 0, updatedU = 0, placedG = 0;

      MapCtrl._batchLoading = true;
      try {
        units.forEach(u => {
          if (!u.id || !isFinite(u.lat) || !isFinite(u.lng)) return;
          const unit = {
            id:         u.id,
            mission_id: Mission.active ? Mission.current.id : null,
            sidc:       u.sidc || 'SFGPUC-----',
            callsign:   String(u.callsign || 'IMPORTED').trim().slice(0, 24),
            lat:        u.lat,
            lng:        u.lng,
            notes:      u.notes || '',
            redcon:     Math.max(1, Math.min(5, +u.redcon || 5)),
            opstat:     ['FMC','PMC','NMC'].includes(u.opstat) ? u.opstat : 'FMC',
            lace:       u.lace ? {
              l: Math.max(0, Math.min(100, parseInt(u.lace.l, 10) || 0)),
              a: Math.max(0, Math.min(100, parseInt(u.lace.a, 10) || 0)),
              c: Math.max(0,              parseInt(u.lace.c, 10) || 0),
              e: Math.max(0, Math.min(100, parseInt(u.lace.e, 10) || 0)),
            } : null,
            updated_at: new Date().toISOString(),
          };
          if (MapCtrl._units[u.id]) {
            MapCtrl._updateUnit(u.id, unit);
            updatedU++;
          } else {
            MapCtrl._addUnitMarker(unit);
            if (Mission.active) DB.upsertUnit(unit).catch(e => UI.toast('Sync failed: ' + e.message, 'error', 2000));
            placed++;
          }
          LocalStore.upsertUnit(unit);
        });
      } finally {
        MapCtrl._batchLoading = false;
        MapCtrl.updateUnitCount();
      }

      graphics.forEach(g => {
        if (!g.id || !g.type || !g.geometry) return;
        if (!MapCtrl._graphics[g.id]) {
          MapCtrl._renderGraphic(g);
          LocalStore.upsertGraphic(g);
          placedG++;
        }
      });

      const msg = [
        placed    && `${placed} unit${placed !== 1 ? 's' : ''} added`,
        updatedU  && `${updatedU} updated`,
        placedG   && `${placedG} graphic${placedG !== 1 ? 's' : ''} added`,
      ].filter(Boolean).join(', ');
      UI.toast(`Plan imported: ${msg || 'no changes'}`, 'success');
    } catch(e) {
      UI.toast('Plan import error: ' + e.message, 'error');
    }
  },

  _toggleTracking() {
    const btn = document.getElementById('btn-locate');
    if (this._watchId) {
      // Tracking is on: first tap re-enables follow, second tap (already following) stops tracking
      if (!this._followGPS) {
        this._followGPS = true;
        btn.classList.add('active');
        btn.classList.remove('active-dim');
        if (App._selfPos) MapCtrl.panTo(App._selfPos.lat, App._selfPos.lng);
        UI.toast('Following GPS position', 'info', 1500);
        return;
      }
      navigator.geolocation.clearWatch(this._watchId);
      this._watchId  = null;
      this._followGPS = true;
      btn.classList.remove('active');
      UI.toast('Location tracking off', 'info');
      return;
    }
    if (!navigator.geolocation) { UI.toast('Geolocation not supported', 'error'); return; }

    this._followGPS = true;

    let _dragHandler = null;
    const _attachDragHandler = () => {
      if (_dragHandler) MapCtrl.map.off('dragstart', _dragHandler);
      _dragHandler = () => {
        _dragHandler = null;
        if (App._watchId) {
          App._followGPS = false;
          btn.classList.remove('active');
          btn.classList.add('active-dim');
        }
      };
      MapCtrl.map.once('dragstart', _dragHandler);
    };
    _attachDragHandler();

    this._watchId = navigator.geolocation.watchPosition(
      pos => {
        const { latitude: lat, longitude: lng, heading, speed, accuracy } = pos.coords;
        App._selfPos = { lat, lng };
        MapCtrl.showSelf(lat, lng, accuracy);
        if (App._followGPS) MapCtrl.panTo(lat, lng);
        btn.classList.toggle('active',     App._followGPS);
        btn.classList.toggle('active-dim', !App._followGPS);

        // Re-attach drag listener so it fires after next re-center
        if (App._followGPS) _attachDragHandler();

        // Broadcast to BFT if mission active (max once per 15 seconds)
        if (Mission.active) {
          const now = Date.now();
          if (now - App._lastBFT > 15000) {
            App._lastBFT = now;
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
        if (App._watchId != null) {
          navigator.geolocation.clearWatch(App._watchId);
          App._watchId = null;
        }
        App._followGPS = true;
        btn.classList.remove('active', 'active-dim');
        UI.toast('Location error: ' + err.message, 'error');
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
