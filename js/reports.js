// Military report forms: LACE, SPOTREP, 9-Line MEDEVAC, SITREP

function _selfMGRS() {
  const t = document.getElementById('coord-mgrs')?.textContent || '';
  return t === 'No position' ? '' : t;
}

const Reports = {
  _ctx: null,  // { type, lat, lng, unitId }

  laceColor(pct) {
    if (pct >= 75) return 'green';
    if (pct >= 50) return 'amber';
    if (pct >= 25) return 'red';
    return 'black';
  },

  // ── LACE ─────────────────────────────────────────────────
  openLACE(unitId, lace) {
    if (!lace && unitId) {
      const prev = LocalStore.getReports()
        .filter(r => r.type === 'LACE' && r.unit_id === unitId)
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0];
      if (prev?.data) lace = prev.data;
    }
    lace = lace || { l: 100, a: 100, c: 0, e: 100 };
    this._ctx = { type: 'LACE', unitId };
    document.getElementById('lace-liquid').value = lace.l ?? 100;
    document.getElementById('lace-ammo').value   = lace.a ?? 100;
    document.getElementById('lace-cas').value    = lace.c ?? 0;
    document.getElementById('lace-equip').value  = lace.e ?? 100;
    this._updateLACEBars();
    UI.showSheet('sheet-lace');
  },

  _updateLACEBars() {
    ['liquid', 'ammo', 'equip'].forEach(k => {
      const pct  = +(document.getElementById(`lace-${k}`)?.value || 0);
      const fill = document.getElementById(`lace-${k}-fill`);
      const val  = document.getElementById(`lace-${k}-val`);
      if (fill) { fill.style.width = pct + '%'; fill.className = `lace-fill ${this.laceColor(pct)}`; }
      if (val)  val.textContent = pct + '%';
    });
    const cas = +(document.getElementById('lace-cas')?.value || 0);
    const cv  = document.getElementById('lace-cas-val');
    if (cv) cv.textContent = cas + (cas === 1 ? ' casualty' : ' casualties');
  },

  submitLACE() {
    const l = +(document.getElementById('lace-liquid').value);
    const a = +(document.getElementById('lace-ammo').value);
    const c = +(document.getElementById('lace-cas').value);
    const e = +(document.getElementById('lace-equip').value);
    const lace = { l, a, c, e };

    if (this._ctx?.unitId) MapCtrl.updateUnitLACE(this._ctx.unitId, lace);

    LocalStore.upsertReport({
      id:         crypto.randomUUID(),
      type:       'LACE',
      reporter:   Auth.callsign,
      unit_id:    this._ctx?.unitId,
      data:       lace,
      mgrs:       _selfMGRS(),
      created_at: new Date().toISOString()
    });
    if (Chat.isJoined()) Chat.send(`LACE: Liquid ${l}% Ammo ${a}% Equip ${e}% — Cas:${c}`);
    UI.closeSheet('sheet-lace');
    UI.toast('LACE report filed', 'success');
    this._ctx = null;
  },

  // ── SPOTREP / SALUTE ──────────────────────────────────────
  openSPOTREP(lat, lng) {
    this._ctx = { type: 'SPOTREP', lat, lng };
    document.getElementById('spot-location').value   = toMGRS(lat, lng, 5) || '';
    document.getElementById('spot-dtg').value        = this._dtg();
    document.getElementById('spot-size').value       = '';
    document.getElementById('spot-activity').value   = '';
    document.getElementById('spot-unit-id').value    = '';
    document.getElementById('spot-equip').value      = '';
    document.getElementById('spot-assessment').value = '';
    UI.showSheet('sheet-spotrep');
  },

  submitSPOTREP() {
    const size     = document.getElementById('spot-size').value.trim();
    const activity = document.getElementById('spot-activity').value.trim();
    const location = document.getElementById('spot-location').value.trim();
    const unitId   = document.getElementById('spot-unit-id').value.trim();
    const dtg      = document.getElementById('spot-dtg').value.trim();
    const equip    = document.getElementById('spot-equip').value.trim();
    const assess   = document.getElementById('spot-assessment').value.trim();

    if (!size && !activity) { UI.toast('Enter at least Size and Activity', 'error'); return; }

    const rpt = {
      id:         crypto.randomUUID(),
      type:       'SPOTREP',
      reporter:   Auth.callsign,
      lat:        this._ctx?.lat,
      lng:        this._ctx?.lng,
      mgrs:       location,
      data:       { size, activity, location, unit: unitId, time: dtg, equip, assess },
      created_at: new Date().toISOString()
    };
    LocalStore.upsertReport(rpt);
    const hasLoc = this._ctx?.lat != null;
    if (hasLoc) MapCtrl.placeReportMarker(rpt);

    if (Chat.isJoined()) {
      Chat.send(`SPOTREP: ${size} ${activity} at ${location} DTG ${dtg}`);
    }
    UI.closeSheet('sheet-spotrep');
    UI.toast(hasLoc ? 'SPOTREP filed — enemy marker placed' : 'SPOTREP filed', 'success');
    this._ctx = null;
  },

  // ── 9-Line MEDEVAC ────────────────────────────────────────
  open9Line(lat, lng) {
    this._ctx = { type: '9LINE', lat, lng };
    document.getElementById('m9-loc').value      = toMGRS(lat, lng, 5) || '';
    document.getElementById('m9-freq').value     = '';
    document.getElementById('m9-prec').value     = 'A';
    document.getElementById('m9-equip').value    = 'A';
    document.getElementById('m9-patients').value = 'A';
    document.getElementById('m9-security').value = 'N';
    document.getElementById('m9-marking').value  = 'C';
    document.getElementById('m9-national').value = 'A';
    document.getElementById('m9-nbc').value      = 'N';
    UI.showSheet('sheet-9line');
  },

  submit9Line() {
    const f = {
      line1: document.getElementById('m9-loc').value.trim(),
      line2: document.getElementById('m9-freq').value.trim(),
      line3: document.getElementById('m9-prec').value,
      line4: document.getElementById('m9-equip').value,
      line5: document.getElementById('m9-patients').value,
      line6: document.getElementById('m9-security').value,
      line7: document.getElementById('m9-marking').value,
      line8: document.getElementById('m9-national').value,
      line9: document.getElementById('m9-nbc').value,
    };
    if (!f.line1) { UI.toast('Line 1 (location) required', 'error'); return; }

    const rpt = {
      id:         crypto.randomUUID(),
      type:       '9LINE',
      reporter:   Auth.callsign,
      lat:        this._ctx?.lat,
      lng:        this._ctx?.lng,
      mgrs:       f.line1,
      data:       f,
      created_at: new Date().toISOString()
    };
    LocalStore.upsertReport(rpt);
    if (this._ctx?.lat != null) MapCtrl.placeReportMarker(rpt);

    if (Chat.isJoined()) {
      Chat.send(`9-LINE MEDEVAC: L1 ${f.line1} | L3 ${f.line3} | L5 ${f.line5}`);
    }
    UI.closeSheet('sheet-9line');
    UI.toast('9-Line MEDEVAC sent', 'success');
    this._ctx = null;
  },

  // ── SITREP ─────────────────────────────────────────────────
  openSITREP() {
    document.getElementById('sit-unit').value     = Auth.callsign || '';
    document.getElementById('sit-dtg').value      = this._dtg();
    const coordTxt = document.getElementById('coord-mgrs')?.textContent || '';
    document.getElementById('sit-loc').value      = coordTxt === 'No position' ? '' : coordTxt;
    document.getElementById('sit-friendly').value = '';
    document.getElementById('sit-enemy').value    = '';
    document.getElementById('sit-log').value      = '';
    document.getElementById('sit-assess').value   = '';
    UI.showSheet('sheet-sitrep');
  },

  submitSITREP() {
    const d = {
      unit:     document.getElementById('sit-unit').value.trim(),
      dtg:      document.getElementById('sit-dtg').value.trim(),
      location: document.getElementById('sit-loc').value.trim(),
      friendly: document.getElementById('sit-friendly').value.trim(),
      enemy:    document.getElementById('sit-enemy').value.trim(),
      log:      document.getElementById('sit-log').value.trim(),
      assess:   document.getElementById('sit-assess').value.trim(),
    };
    LocalStore.upsertReport({
      id: crypto.randomUUID(), type: 'SITREP', reporter: Auth.callsign,
      mgrs: d.location, data: d, created_at: new Date().toISOString()
    });
    if (Chat.isJoined()) {
      const parts = [];
      if (d.location) parts.push(`Loc:${d.location}`);
      if (d.friendly) parts.push(`F:${d.friendly.slice(0, 80)}`);
      if (d.enemy)    parts.push(`E:${d.enemy.slice(0, 60)}`);
      if (d.log)      parts.push(`L:${d.log.slice(0, 40)}`);
      Chat.send(`SITREP ${d.unit} ${d.dtg}${parts.length ? ': ' + parts.join(' | ') : ''}`);
    }
    UI.closeSheet('sheet-sitrep');
    UI.toast('SITREP sent', 'success');
  },

  // ── ACE Report ────────────────────────────────────────────
  openACE(unitId) {
    this._ctx = { type: 'ACE', unitId };
    const prev = unitId
      ? LocalStore.getReports()
          .filter(r => r.type === 'ACE' && r.unit_id === unitId)
          .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0]
      : null;
    document.getElementById('ace-ammo').value  = prev?.data?.a  ?? 100;
    document.getElementById('ace-equip').value = prev?.data?.e  ?? 100;
    document.getElementById('ace-kia').value   = prev?.data?.kia ?? 0;
    document.getElementById('ace-wia').value   = prev?.data?.wia ?? 0;
    document.getElementById('ace-mia').value   = prev?.data?.mia ?? 0;
    this._updateACEBars();
    UI.showSheet('sheet-ace');
  },

  _updateACEBars() {
    ['ammo', 'equip'].forEach(k => {
      const pct  = +(document.getElementById(`ace-${k}`)?.value || 0);
      const fill = document.getElementById(`ace-${k}-fill`);
      const val  = document.getElementById(`ace-${k}-val`);
      if (fill) { fill.style.width = pct + '%'; fill.className = `lace-fill ${this.laceColor(pct)}`; }
      if (val)  val.textContent = pct + '%';
    });
  },

  submitACE() {
    const a = +(document.getElementById('ace-ammo').value);
    const e = +(document.getElementById('ace-equip').value);
    const kia = +(document.getElementById('ace-kia').value);
    const wia = +(document.getElementById('ace-wia').value);
    const mia = +(document.getElementById('ace-mia').value);
    LocalStore.upsertReport({
      id: crypto.randomUUID(), type: 'ACE', reporter: Auth.callsign,
      unit_id: this._ctx?.unitId, mgrs: _selfMGRS(),
      data: { a, e, kia, wia, mia }, created_at: new Date().toISOString()
    });
    if (Chat.isJoined()) Chat.send(`ACE: Ammo ${a}% Equip ${e}% — KIA:${kia} WIA:${wia} MIA:${mia}`);
    UI.closeSheet('sheet-ace');
    UI.toast('ACE report filed', 'success');
    this._ctx = null;
  },

  // ── NBC Warning ───────────────────────────────────────────
  _nbcType: 'C',

  openNBC(lat, lng) {
    this._ctx    = { type: 'NBC', lat, lng };
    this._nbcType = 'C';
    document.querySelectorAll('.nbc-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === 'C'));
    document.getElementById('nbc-loc').value     = toMGRS(lat, lng, 5) || '';
    document.getElementById('nbc-dtg').value     = this._dtg();
    document.getElementById('nbc-wind').value    = '';
    document.getElementById('nbc-hazard').value  = '';
    document.getElementById('nbc-actions').value = '';
    UI.showSheet('sheet-nbc');
  },

  submitNBC() {
    const loc     = document.getElementById('nbc-loc').value.trim();
    const dtg     = document.getElementById('nbc-dtg').value.trim();
    const wind    = document.getElementById('nbc-wind').value.trim();
    const hazard  = document.getElementById('nbc-hazard').value.trim();
    const actions = document.getElementById('nbc-actions').value.trim();
    if (!loc) { UI.toast('Location required', 'error'); return; }
    const rpt = {
      id: crypto.randomUUID(), type: 'NBC', reporter: Auth.callsign,
      lat: this._ctx?.lat, lng: this._ctx?.lng, mgrs: loc,
      data: { type: this._nbcType, loc, dtg, wind, hazard, actions },
      created_at: new Date().toISOString()
    };
    LocalStore.upsertReport(rpt);
    if (this._ctx?.lat != null) MapCtrl.placeReportMarker(rpt);
    if (Chat.isJoined()) Chat.send(`⚠ NBC WARNING (${this._nbcType}): ${loc} DTG ${dtg} — ${hazard}`);
    UI.closeSheet('sheet-nbc');
    UI.toast('NBC warning sent', 'success');
    this._ctx = null;
  },

  // ── Reports Log ────────────────────────────────────────────
  _logFilter: 'ALL',

  openLog() {
    this._logFilter = 'ALL';
    const bar = document.getElementById('reports-log-filter');
    if (bar) bar.querySelectorAll('.rpt-filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.type === 'ALL');
    });
    this._renderLog();
    UI.showSheet('sheet-reports-log');
  },

  _renderLog() {
    const list = document.getElementById('reports-log-list');
    if (!list) return;
    const all     = LocalStore.getReports()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const reports = (this._logFilter && this._logFilter !== 'ALL')
      ? all.filter(r => r.type === this._logFilter)
      : all;

    if (!reports.length) {
      list.innerHTML = this._logFilter !== 'ALL'
        ? `<p class="empty-msg">No ${_escH(this._logFilter)} reports</p>`
        : '<p class="empty-msg">No reports filed yet</p>';
      return;
    }

    list.innerHTML = reports.map(r => {
      const dt      = new Date(r.created_at);
      const dtLabel = dt.toLocaleDateString([], {month:'short', day:'numeric'}) +
                      ' ' + dt.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
      const preview = this._reportPreview(r);
      const unitEntry = r.unit_id ? MapCtrl._units?.[r.unit_id] : null;
      const unitLabel = unitEntry ? ` · ${_escH(unitEntry.data.callsign || '')}` : '';
      const hasLoc = r.lat != null && r.lng != null;
      return `<div class="rpt-log-entry">
        <div class="rpt-log-header">
          <span class="rpt-log-badge ${_escH(r.type.toLowerCase())}">${_escH(r.type)}</span>
          <span class="rpt-log-meta">${_escH(r.reporter || '—')}${unitLabel} · ${dtLabel}</span>
          <div class="rpt-log-actions">
            ${hasLoc ? `<button class="rpt-log-fly" data-id="${_escH(r.id)}" title="Fly to location">⌖</button>` : ''}
            <button class="rpt-log-chat" data-id="${_escH(r.id)}" title="Send to chat">▲</button>
            <button class="rpt-log-copy" data-id="${_escH(r.id)}">Copy</button>
            <button class="rpt-log-del" data-id="${_escH(r.id)}" title="Delete report">✕</button>
          </div>
        </div>
        <div class="rpt-log-preview">${preview}</div>
      </div>`;
    }).join('');

    list.querySelectorAll('.rpt-log-chat').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!Chat.isJoined()) { UI.toast('Join a mission to use chat', 'info'); return; }
        const r = reports.find(x => x.id === btn.dataset.id);
        if (r) { Chat.send(this._reportChatSummary(r)); UI.toast('Sent to chat', 'success', 2000); }
      });
    });

    list.querySelectorAll('.rpt-log-copy').forEach(btn => {
      btn.addEventListener('click', () => {
        const r = reports.find(x => x.id === btn.dataset.id);
        if (r) this._copyReport(r);
      });
    });

    list.querySelectorAll('.rpt-log-fly').forEach(btn => {
      btn.addEventListener('click', () => {
        const r = reports.find(x => x.id === btn.dataset.id);
        if (r?.lat != null && r?.lng != null) {
          UI.closeSheet('sheet-reports-log');
          MapCtrl.flyToGrid(r.lat, r.lng);
        }
      });
    });

    list.querySelectorAll('.rpt-log-del').forEach(btn => {
      btn.addEventListener('click', () => {
        MapCtrl.removeReportMarker(btn.dataset.id);
        LocalStore.deleteReport(btn.dataset.id);
        this._renderLog();
      });
    });
  },

  _reportPreview(r) {
    const h = s => _escH(String(s ?? ''));
    const d = r.data || {};
    if (r.type === 'SPOTREP') return `${h(d.size)} — ${h(d.activity)} @ ${h(r.mgrs)}`.trim();
    if (r.type === '9LINE')   return `L1:${h(d.line1)} L3:${h(d.line3)} L5:${h(d.line5)}`;
    if (r.type === 'SITREP')  return `${h(d.unit)} — ${h((d.friendly || '').slice(0,80))}`;
    if (r.type === 'LACE')    return `L:${h(d.l)}% A:${h(d.a)}% C:${h(d.c)} E:${h(d.e)}%`;
    if (r.type === 'ACE')     return `A:${h(d.a)}% E:${h(d.e)}% KIA:${h(d.kia)} WIA:${h(d.wia)} MIA:${h(d.mia)}`;
    if (r.type === 'NBC')     return `${h(d.type)} — ${h(r.mgrs)} DTG ${h(d.dtg)}`;
    return '';
  },

  _reportChatSummary(r) {
    const d = r.data || {};
    if (r.type === 'SPOTREP') return `SPOTREP ${r.reporter}: ${d.size || ''} ${d.activity || ''} @ ${r.mgrs || ''} DTG ${d.time || ''}`.trim().replace(/\s+/g, ' ');
    if (r.type === '9LINE')   return `9-LINE ${r.reporter}: L1 ${d.line1 || ''} L3 ${d.line3 || ''} L5 ${d.line5 || ''}`;
    if (r.type === 'SITREP')  return `SITREP ${d.unit || r.reporter}: ${(d.friendly || 'NTR').slice(0, 100)}`;
    if (r.type === 'LACE')    return `LACE ${r.reporter}: L:${d.l}% A:${d.a}% C:${d.c} E:${d.e}%`;
    if (r.type === 'ACE')     return `ACE ${r.reporter}: A:${d.a}% E:${d.e}% KIA:${d.kia} WIA:${d.wia} MIA:${d.mia}`;
    if (r.type === 'NBC')     return `⚠ NBC (${d.type}) ${r.reporter}: ${r.mgrs || ''} DTG ${d.dtg || ''}${d.hazard ? ' — ' + d.hazard : ''}`;
    return `${r.type} ${r.reporter}`;
  },

  _copyReport(r) {
    const text = this._formatReport(r);
    navigator.clipboard?.writeText(text)
      .then(() => UI.toast('Report copied to clipboard', 'success'))
      .catch(() => UI.toast('Copy failed — check browser permissions', 'error'));
  },

  exportAll() {
    const reports = LocalStore.getReports()
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    if (!reports.length) { UI.toast('No reports to export', 'info'); return; }
    const divider = '\n' + '─'.repeat(40) + '\n\n';
    const text = reports.map(r => this._formatReport(r)).join(divider);
    navigator.clipboard?.writeText(text)
      .then(() => UI.toast(`${reports.length} report${reports.length !== 1 ? 's' : ''} copied to clipboard`, 'success'))
      .catch(() => {
        const blob = new Blob([text], { type: 'text/plain' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = `reports-${new Date().toISOString().slice(0,10)}.txt`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        UI.toast(`${reports.length} reports downloaded`, 'success');
      });
  },

  _formatReport(r) {
    const dtg = r.data?.time || this._dtgFromISO(r.created_at);
    const lines = [];
    if (r.type === 'SPOTREP') {
      lines.push(`SPOTREP — ${r.reporter} — ${dtg}`);
      lines.push(`S - Size:       ${r.data.size || 'Unknown'}`);
      lines.push(`A - Activity:   ${r.data.activity || 'Unknown'}`);
      lines.push(`L - Location:   ${r.mgrs || 'Unknown'}`);
      lines.push(`U - Unit:       ${r.data.unit || 'Unknown'}`);
      lines.push(`T - Time:       ${dtg}`);
      lines.push(`E - Equipment:  ${r.data.equip || 'Unknown'}`);
      if (r.data.assess) lines.push(`Assessment:     ${r.data.assess}`);
    } else if (r.type === '9LINE') {
      lines.push(`9-LINE MEDEVAC — ${r.reporter} — ${dtg}`);
      lines.push(`L1  Location:   ${r.data.line1 || ''}`);
      lines.push(`L2  Frequency:  ${r.data.line2 || ''}`);
      lines.push(`L3  Precedence: ${r.data.line3 || ''}`);
      lines.push(`L4  Equipment:  ${r.data.line4 || ''}`);
      lines.push(`L5  Patients:   ${r.data.line5 || ''}`);
      lines.push(`L6  Security:   ${r.data.line6 || ''}`);
      lines.push(`L7  Marking:    ${r.data.line7 || ''}`);
      lines.push(`L8  Nationality:${r.data.line8 || ''}`);
      lines.push(`L9  NBC:        ${r.data.line9 || ''}`);
    } else if (r.type === 'SITREP') {
      lines.push(`SITREP — ${r.data.unit || r.reporter} — ${r.data.dtg || dtg}`);
      lines.push(`Location:  ${r.data.location || ''}`);
      lines.push(`Friendly:  ${r.data.friendly || 'NTR'}`);
      lines.push(`Enemy:     ${r.data.enemy || 'NTR'}`);
      if (r.data.log)    lines.push(`Logistics: ${r.data.log}`);
      if (r.data.assess) lines.push(`Assessment: ${r.data.assess}`);
    } else if (r.type === 'LACE') {
      lines.push(`LACE REPORT — ${r.reporter} — ${dtg}`);
      lines.push(`Liquid:      ${r.data.l}%`);
      lines.push(`Ammo:        ${r.data.a}%`);
      lines.push(`Casualties:  ${r.data.c}`);
      lines.push(`Equipment:   ${r.data.e}%`);
    } else if (r.type === 'ACE') {
      lines.push(`ACE REPORT — ${r.reporter} — ${dtg}`);
      lines.push(`Ammo:        ${r.data.a}%`);
      lines.push(`Casualties:  KIA:${r.data.kia}  WIA:${r.data.wia}  MIA:${r.data.mia}`);
      lines.push(`Equipment:   ${r.data.e}%`);
      if (r.mgrs) lines.push(`Location:    ${r.mgrs}`);
    } else if (r.type === 'NBC') {
      const typeNames = { N:'Nuclear', B:'Biological', C:'Chemical', R:'Radiological' };
      lines.push(`NBC WARNING — ${typeNames[r.data.type] || r.data.type} — ${r.reporter} — ${dtg}`);
      lines.push(`Location:    ${r.data.loc || r.mgrs || 'Unknown'}`);
      lines.push(`DTG:         ${r.data.dtg || dtg}`);
      if (r.data.wind)    lines.push(`Wind (from): ${r.data.wind}`);
      if (r.data.hazard)  lines.push(`Hazard Area: ${r.data.hazard}`);
      if (r.data.actions) lines.push(`Actions:     ${r.data.actions}`);
    }
    return lines.join('\n');
  },

  _dtgFromISO(iso) {
    if (!iso) return '——';
    const d  = new Date(iso);
    const dd = String(d.getUTCDate()).padStart(2,'0');
    const hh = String(d.getUTCHours()).padStart(2,'0');
    const mm = String(d.getUTCMinutes()).padStart(2,'0');
    const mo = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getUTCMonth()];
    return `${dd}${hh}${mm}Z ${mo} ${String(d.getUTCFullYear()).slice(2)}`;
  },

  _dtg() {
    const d   = new Date();
    const dd  = String(d.getUTCDate()).padStart(2, '0');
    const hh  = String(d.getUTCHours()).padStart(2, '0');
    const mm  = String(d.getUTCMinutes()).padStart(2, '0');
    const mon = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getUTCMonth()];
    const yr  = String(d.getUTCFullYear()).slice(2);
    return `${dd}${hh}${mm}Z ${mon} ${yr}`;
  }
};
