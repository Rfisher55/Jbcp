// Military report forms: LACE, SPOTREP, 9-Line MEDEVAC, SITREP
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
      mgrs:       document.getElementById('coord-mgrs')?.textContent || '',
      created_at: new Date().toISOString()
    });
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
    if (this._ctx?.lat != null) MapCtrl.placeReportMarker(rpt);

    if (Chat.isJoined()) {
      Chat.send(`SPOTREP: ${size} ${activity} at ${location} DTG ${dtg}`);
    }
    UI.closeSheet('sheet-spotrep');
    UI.toast('SPOTREP filed — enemy marker placed', 'success');
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
    document.getElementById('sit-loc').value      = document.getElementById('coord-mgrs')?.textContent || '';
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
      Chat.send(`SITREP ${d.unit} ${d.dtg}: ${d.friendly.slice(0, 120)}`);
    }
    UI.closeSheet('sheet-sitrep');
    UI.toast('SITREP sent', 'success');
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
