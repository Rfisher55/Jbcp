// Leaflet map controller — units, graphics, MGRS readout

const BASEMAPS = {
  osm: {
    name: 'Street',
    url:  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    opts: { attribution: '© OpenStreetMap contributors', maxZoom: 19 }
  },
  satellite: {
    name: 'Satellite',
    url:  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    opts: { attribution: '© Esri, Maxar, Earthstar Geographics', maxZoom: 19 }
  },
  topo: {
    name: 'Topo',
    url:  'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
    opts: { attribution: 'USGS', maxZoom: 16 }
  },
};

const MapCtrl = {
  _map:              null,
  _grid:             null,
  _unitLayer:        null,
  _graphicLayer:     null,
  _reportLayer:      null,
  _measureLayer:     null,
  _pinLayer:         null,
  _previewGroup:     null,
  _selfMarker:       null,
  _units:            {},
  _graphics:         {},
  _pins:             {},
  _basemap:          null,
  _currentBase:      'osm',
  _activeTool:       'select',
  _drawPoints:       [],
  _measurePts:       [],
  _activeSIDC:       null,
  _activeCatalogEntry: null,
  _activeEchelon:    '',
  _activeGraphicType:null,
  _pendingLatLng:    null,
  _clickTimeout:     null,
  _ctxLatLng:        null,
  _symbolScale:      1.0,

  init() {
    this._map = L.map('map', {
      center:           AO.center,
      zoom:             AO.zoom,
      zoomControl:      false,
      attributionControl: true,
      doubleClickZoom:  false,
    });

    this._basemap = L.tileLayer(BASEMAPS.osm.url, BASEMAPS.osm.opts).addTo(this._map);

    this._unitLayer    = L.featureGroup().addTo(this._map);
    this._graphicLayer = L.featureGroup().addTo(this._map);
    this._reportLayer  = L.featureGroup().addTo(this._map);
    this._measureLayer = L.featureGroup().addTo(this._map);
    this._pinLayer     = L.featureGroup().addTo(this._map);
    this._previewGroup = L.featureGroup().addTo(this._map);

    this._symbolScale  = parseFloat(localStorage.getItem('cop_symbol_scale') || '1.0');

    BFT.init(this._map);

    this._grid = createMGRSGrid().addTo(this._map);

    // MGRS cursor readout + draw preview
    this._map.on('mousemove', e => {
      const s = toMGRS(e.latlng.lat, e.latlng.lng, 4);
      document.getElementById('mgrs-display').textContent = s || '──';
      if (this._isDrawing() && this._drawPoints.length > 0) {
        this._updatePreview(e.latlng);
      }
    });
    this._map.on('mouseout', () => {
      document.getElementById('mgrs-display').textContent = '──────────────';
      if (this._isDrawing()) this._updatePreview(null);
    });

    this._map.on('click',       e => this._onMapClick(e));
    this._map.on('dblclick',    e => this._onMapDblClick(e));
    this._map.on('contextmenu', e => this._onMapContextMenu(e));
    this._map.on('zoomend',     () => this._refreshIconSizes());

    // Long-press for mobile context menu
    const mc = this._map.getContainer();
    let _lpTimer = null;
    mc.addEventListener('touchstart', e => {
      if (this._isDrawing() || this._activeTool !== 'select') return;
      if (e.touches.length !== 1) return;
      clearTimeout(_lpTimer);
      const t    = e.touches[0];
      const rect = mc.getBoundingClientRect();
      const pt   = L.point(t.clientX - rect.left, t.clientY - rect.top);
      const ll   = this._map.containerPointToLatLng(pt);
      _lpTimer = setTimeout(() => { this._showContextMenu(ll); }, 600);
    }, { passive: true });
    mc.addEventListener('touchend',    () => clearTimeout(_lpTimer), { passive: true });
    mc.addEventListener('touchmove',   () => clearTimeout(_lpTimer), { passive: true });
    mc.addEventListener('touchcancel', () => clearTimeout(_lpTimer), { passive: true });

    return this;
  },

  _isDrawing() {
    return ['draw-line', 'draw-area', 'draw-graphic'].includes(this._activeTool);
  },

  _getIconSize() {
    const z = this._map ? this._map.getZoom() : 13;
    let base;
    if      (z <= 5)  base = 10;
    else if (z <= 7)  base = 14;
    else if (z <= 9)  base = 20;
    else if (z <= 11) base = 26;
    else if (z <= 13) base = 32;
    else if (z <= 15) base = 40;
    else              base = 48;
    return Math.max(8, Math.round(base * this._symbolScale));
  },

  setSymbolScale(s) {
    this._symbolScale = s;
    localStorage.setItem('cop_symbol_scale', String(s));
    this._refreshIconSizes();
  },

  _refreshIconSizes() {
    const size = this._getIconSize();
    Object.values(this._units).forEach(({ data, marker }) => {
      marker.setIcon(makeMilIcon(data.sidc, size));
    });
  },

  // ── Tool activation ─────────────────────────────────────
  setTool(tool) {
    this._activeTool = tool;
    this._drawPoints = [];
    this._clearPreview();
    this._activeGraphicType = null;

    const mc = this._map.getContainer();
    mc.className = mc.className.replace(/cursor-\S+/g, '').trim();

    const drawToolbar = document.getElementById('draw-toolbar');
    if (drawToolbar) drawToolbar.classList.add('hidden');

    if (tool === 'place-unit')  { mc.classList.add('cursor-cell'); }
    if (tool === 'draw-line')   { mc.classList.add('cursor-crosshair'); drawToolbar?.classList.remove('hidden'); this._updateDrawCount(); }
    if (tool === 'draw-area')   { mc.classList.add('cursor-crosshair'); drawToolbar?.classList.remove('hidden'); this._updateDrawCount(); }
    if (tool === 'measure')     { mc.classList.add('cursor-crosshair'); UI.showSheet('sheet-measure'); }
    if (tool === 'pin')         { mc.classList.add('cursor-crosshair'); UI.toast('Tap map to drop a pin — grid auto-copies', 'info', 2500); }
    if (tool === 'plot-grid')   { UI.showSheet('sheet-plot-grid'); this._activeTool = 'select'; }
    if (tool === 'select')      { this._activeSIDC = null; this._activeCatalogEntry = null; }
  },

  // Start a tactical graphic draw with a specific type
  startGraphicDraw(graphicType) {
    this._activeGraphicType = graphicType;
    this._drawPoints = [];
    this._activeTool = 'draw-graphic';
    this._clearPreview();

    const mc = this._map.getContainer();
    mc.className = mc.className.replace(/cursor-\S+/g, '').trim();
    mc.classList.add('cursor-crosshair');

    document.getElementById('draw-toolbar')?.classList.remove('hidden');
    this._updateDrawCount();
  },

  // Store the selected symbol before clicking the map
  setActiveSIDC(entry, echelon) {
    this._activeCatalogEntry = entry;
    this._activeEchelon      = echelon;
    this._activeSIDC         = buildSIDC(entry.base, echelon);
  },

  // ── Pin drop ─────────────────────────────────────────────
  _dropPin(latlng) {
    const mgrs = toMGRS(latlng.lat, latlng.lng, 5) || `${latlng.lat.toFixed(5)},${latlng.lng.toFixed(5)}`;
    const id   = crypto.randomUUID();
    const icon = L.divIcon({
      html: `<div class="pin-wrap"><div class="pin-dot"></div><div class="pin-label">${_escH(mgrs)}</div></div>`,
      className: '', iconSize: [8, 8], iconAnchor: [4, 4],
    });
    const marker = L.marker(latlng, { icon, zIndexOffset: 700, interactive: true });
    marker.on('click', () => {
      navigator.clipboard?.writeText(mgrs).then(() => UI.toast('Grid copied: ' + mgrs, 'success'));
    });
    marker.on('contextmenu', () => {
      this._pinLayer.removeLayer(marker);
      delete this._pins[id];
    });
    marker.addTo(this._pinLayer);
    this._pins[id] = { marker, mgrs };
    navigator.clipboard?.writeText(mgrs).then(() => UI.toast(`Pin dropped — Grid copied: ${mgrs}`, 'success'));
  },

  clearPins() {
    this._pinLayer.clearLayers();
    this._pins = {};
  },

  flyToGrid(lat, lng) {
    const zoom = Math.max(this._map.getZoom(), 14);
    this._map.flyTo([lat, lng], zoom, { animate: true, duration: 1.2 });
    const mgrs = toMGRS(lat, lng, 5) || `${lat.toFixed(5)},${lng.toFixed(5)}`;
    UI.toast('Navigating to ' + mgrs, 'info', 2000);
  },

  // ── Map click ────────────────────────────────────────────
  _onMapClick(e) {
    if (this._activeTool === 'pin') {
      this._dropPin(e.latlng);
      return;
    }

    if (this._activeTool === 'place-unit') {
      if (!this._activeSIDC) {
        this._pendingLatLng = e.latlng;
        UI.buildSymbolGrid(App._symFilter || 'F', App._symEchelon || '');
        UI.showSheet('sheet-symbols');
        return;
      }
      this._placeUnitAt(e.latlng);
      return;
    }

    if (this._activeTool === 'measure') {
      this._measurePts.push(e.latlng);
      if (this._measurePts.length === 2) this._computeMeasure();
      else this._drawMeasurePt(e.latlng);
      return;
    }

    if (this._isDrawing()) {
      clearTimeout(this._clickTimeout);
      const latlng = e.latlng;
      this._clickTimeout = setTimeout(() => {
        this._drawPoints.push(latlng);
        this._updatePreview(null);
        this._updateDrawCount();
      }, 180);
    }
  },

  _onMapDblClick(e) {
    if (this._isDrawing()) {
      clearTimeout(this._clickTimeout);
      L.DomEvent.stop(e);
      this.finishDraw();
    }
  },

  _onMapContextMenu(e) {
    if (this._isDrawing()) {
      L.DomEvent.stop(e);
      if (this._drawPoints.length > 0) {
        this._drawPoints.pop();
        this._updatePreview(null);
        this._updateDrawCount();
      }
      return;
    }
    L.DomEvent.stop(e);
    this._showContextMenu(e.latlng);
  },

  _showContextMenu(latlng) {
    this._ctxLatLng = latlng;
    const mgrs = toMGRS(latlng.lat, latlng.lng, 5) || `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
    document.getElementById('ctx-mgrs').textContent = mgrs;
    UI.showSheet('sheet-context');
  },

  // ── Draw preview ─────────────────────────────────────────
  _updatePreview(cursor) {
    this._clearPreview();
    if (!this._isDrawing()) return;

    const gt    = this._activeGraphicType;
    const color = gt?.color || (this._activeTool === 'draw-area' ? '#d29922' : '#58a6ff');
    const dash  = gt?.dash  || null;

    this._drawPoints.forEach(p => {
      L.circleMarker(p, { radius: 4, color, fillColor: color, fillOpacity: 0.9, weight: 1.5, interactive: false })
        .addTo(this._previewGroup);
    });

    const pts = cursor ? [...this._drawPoints, cursor] : this._drawPoints;
    if (pts.length >= 2) {
      L.polyline(pts, { color, weight: 2, opacity: 0.65, dashArray: dash, interactive: false })
        .addTo(this._previewGroup);
    }
  },

  _clearPreview() {
    if (this._previewGroup) this._previewGroup.clearLayers();
  },

  _updateDrawCount() {
    const n  = this._drawPoints.length;
    const gt = this._activeGraphicType;
    const el = document.getElementById('draw-vertex-count');
    const label = document.getElementById('draw-type-label');
    if (el) el.textContent = n + (n === 1 ? ' pt' : ' pts');
    if (label && gt) label.textContent = gt.name;
  },

  // ── Finish / cancel draw ─────────────────────────────────
  finishDraw() {
    this._clearPreview();
    const pts = this._drawPoints.slice();
    this._drawPoints = [];
    document.getElementById('draw-toolbar')?.classList.add('hidden');

    const tool = this._activeTool;
    const gt   = this._activeGraphicType;
    const isArea = tool === 'draw-area' || (tool === 'draw-graphic' && gt?.type === 'area');

    // Reset tool immediately so map stays interactive while label sheet is open
    this._activeGraphicType = null;
    this.setTool('select');
    UI.toolBtn('select');

    if (pts.length < 2 || (isArea && pts.length < 3)) {
      UI.toast('Too few points — draw cancelled', 'info');
      return;
    }

    const save = (label) => {
      if (isArea) {
        const geo = { type: 'Polygon', coordinates: [[...pts.map(p => [p.lng, p.lat]), [pts[0].lng, pts[0].lat]]] };
        const sty = gt
          ? { color: gt.color, weight: gt.weight, dashArray: gt.dash, fillOpacity: gt.fill }
          : { color: '#d29922', fillOpacity: 0.1 };
        this._saveGraphic({ type: 'area', geometry: geo, style: { ...sty, label } });
      } else {
        const geo = { type: 'LineString', coordinates: pts.map(p => [p.lng, p.lat]) };
        const sty = gt
          ? { color: gt.color, weight: gt.weight, dashArray: gt.dash }
          : { color: '#58a6ff', weight: 2 };
        this._saveGraphic({ type: 'line', geometry: geo, style: { ...sty, label } });
      }
    };

    // Only prompt for label if the graphic type expects one
    if (gt?.label !== '') {
      App.promptLabel(gt?.name || (isArea ? 'Area' : 'Line'), gt?.label || '', save);
    } else {
      save('');
    }
  },

  cancelDraw() {
    clearTimeout(this._clickTimeout);
    this._clearPreview();
    this._drawPoints = [];
    this._activeGraphicType = null;
    document.getElementById('draw-toolbar')?.classList.add('hidden');
    this.setTool('select');
    UI.toolBtn('select');
  },

  undoLastPoint() {
    if (this._drawPoints.length > 0) {
      this._drawPoints.pop();
      this._updatePreview(null);
      this._updateDrawCount();
    }
  },

  // ── Place unit ───────────────────────────────────────────
  _placeUnitAt(latlng) {
    const entry = this._activeCatalogEntry;
    if (!entry) return;

    const unit = {
      id:         crypto.randomUUID(),
      mission_id: Mission.active ? Mission.current.id : null,
      sidc:       this._activeSIDC,
      callsign:   entry.name,
      lat:        latlng.lat,
      lng:        latlng.lng,
      notes:      '',
      created_by: Auth.user?.id,
      updated_at: new Date().toISOString(),
    };

    this._addUnitMarker(unit);
    LocalStore.upsertUnit(unit);

    if (Mission.active) {
      DB.upsertUnit(unit).catch(e => UI.toast('Save failed: ' + e.message, 'error'));
    }
    // Keep tool active for placing more of the same symbol
  },

  // Backward-compat: called when symbol is selected after clicking map
  async placeUnit(catalogEntry, echelon) {
    const latlng = this._pendingLatLng;
    if (!latlng) return;
    this._pendingLatLng = null;

    const sidc = buildSIDC(catalogEntry.base, echelon);
    const unit = {
      id:         crypto.randomUUID(),
      mission_id: Mission.active ? Mission.current.id : null,
      sidc,
      callsign:   catalogEntry.name,
      lat:        latlng.lat,
      lng:        latlng.lng,
      notes:      '',
      created_by: Auth.user?.id,
      updated_at: new Date().toISOString(),
    };

    this._addUnitMarker(unit);
    if (Mission.active) {
      DB.upsertUnit(unit).catch(e => UI.toast('Save failed: ' + e.message, 'error'));
    }
    this.setTool('select');
    UI.toolBtn('select');
  },

  _addUnitMarker(unit) {
    const icon   = makeMilIcon(unit.sidc, this._getIconSize());
    const marker = L.marker([unit.lat, unit.lng], { icon, draggable: true })
      .addTo(this._unitLayer);

    marker.on('click', () => {
      if (this._activeTool !== 'select') return;
      this._openUnitDetail(unit.id);
    });
    marker.on('dragend', e => this._onUnitDrag(unit.id, e));

    this._units[unit.id] = { data: unit, marker };
  },

  _openUnitDetail(id) {
    const u = this._units[id];
    if (!u) return;
    UI.showUnitDetail(u.data, {
      onEdit:   updates => this._updateUnit(id, updates),
      onDelete: ()      => this._deleteUnit(id),
    });
  },

  async _updateUnit(id, updates) {
    const entry = this._units[id];
    if (!entry) return;
    Object.assign(entry.data, updates, { updated_at: new Date().toISOString() });
    if (updates.sidc) entry.marker.setIcon(makeMilIcon(updates.sidc, this._getIconSize()));
    LocalStore.upsertUnit(entry.data);
    if (Mission.active) {
      DB.upsertUnit(entry.data).catch(e => UI.toast('Update failed: ' + e.message, 'error'));
    }
  },

  async _deleteUnit(id) {
    const entry = this._units[id];
    if (!entry) return;
    this._unitLayer.removeLayer(entry.marker);
    delete this._units[id];
    LocalStore.deleteUnit(id);
    if (Mission.active) {
      DB.deleteUnit(id).catch(e => UI.toast('Delete failed: ' + e.message, 'error'));
    }
    UI.closeSheet('sheet-unit');
  },

  async _onUnitDrag(id, e) {
    const entry = this._units[id];
    if (!entry) return;
    const { lat, lng } = e.target.getLatLng();
    entry.data.lat = lat;
    entry.data.lng = lng;
    entry.data.updated_at = new Date().toISOString();
    LocalStore.upsertUnit(entry.data);
    if (Mission.active) {
      DB.upsertUnit(entry.data).catch(() => {});
    }
  },

  // ── Remote sync handlers ─────────────────────────────────
  handleRemoteUnit(payload) {
    const { eventType, new: row, old } = payload;
    if (eventType === 'DELETE') {
      const entry = this._units[old.id];
      if (entry) { this._unitLayer.removeLayer(entry.marker); delete this._units[old.id]; }
    } else {
      const existing = this._units[row.id];
      if (existing) {
        existing.data = row;
        existing.marker.setLatLng([row.lat, row.lng]);
        existing.marker.setIcon(makeMilIcon(row.sidc, this._getIconSize()));
      } else {
        this._addUnitMarker(row);
      }
    }
  },

  handleRemoteGraphic(payload) {
    const { eventType, new: row, old } = payload;
    if (eventType === 'DELETE') {
      const g = this._graphics[old.id];
      if (g) { this._graphicLayer.removeLayer(g.layer); delete this._graphics[old.id]; }
    } else {
      this._renderGraphic(row);
    }
  },

  // ── Mission load ─────────────────────────────────────────
  async loadMission(missionId) {
    this._unitLayer.clearLayers();
    this._graphicLayer.clearLayers();
    this._reportLayer.clearLayers();
    this._units    = {};
    this._graphics = {};

    const [units, graphics] = await Promise.all([
      DB.getUnits(missionId),
      DB.getGraphics(missionId),
    ]);

    for (const u of units)   this._addUnitMarker(u);
    for (const g of graphics) this._renderGraphic(g);
    // Load locally-cached reports for this session
    for (const r of LocalStore.getReports()) this.placeReportMarker(r);
    UI.toast(`Loaded ${units.length} unit${units.length !== 1 ? 's' : ''}`, 'info');
  },

  clearMission() {
    this._unitLayer.clearLayers();
    this._graphicLayer.clearLayers();
    this._reportLayer.clearLayers();
    this._units    = {};
    this._graphics = {};
    BFT.leaveMission();
  },

  // ── Graphics ─────────────────────────────────────────────
  _renderGraphic(g) {
    const existing = this._graphics[g.id];
    if (existing) { this._graphicLayer.removeLayer(existing.layer); }

    const geo  = g.geometry;
    const sty  = g.style || {};
    const name = sty.label || '';

    const lineOpts = {
      color:       sty.color || '#58a6ff',
      weight:      sty.weight || 2,
      opacity:     0.9,
      dashArray:   sty.dashArray || null,
      fillOpacity: sty.fillOpacity || 0.12,
    };

    let geomLayer;
    if (geo.type === 'LineString') {
      geomLayer = L.polyline(geo.coordinates.map(c => [c[1], c[0]]), lineOpts);
    } else if (geo.type === 'Polygon') {
      geomLayer = L.polygon(geo.coordinates[0].map(c => [c[1], c[0]]), { ...lineOpts, fill: true });
    } else {
      return;
    }

    const group = L.featureGroup();
    group.addLayer(geomLayer);

    // Label marker
    if (name) {
      const center = this._geomCenter(geo);
      if (center) {
        group.addLayer(L.marker(center, {
          icon: L.divIcon({
            html: `<div class="graphic-label" style="color:${lineOpts.color}">${name}</div>`,
            className: '', iconSize: null,
          }),
          interactive: false,
          zIndexOffset: -10,
        }));
      }
    }

    // Click → select popup with delete
    group.on('click', e => {
      if (this._activeTool !== 'select') return;
      L.DomEvent.stopPropagation(e);
      const nameHtml = name ? `<div style="font-weight:700;margin-bottom:8px;font-size:14px">${name}</div>` : '';
      L.popup({ closeButton: true, autoPan: false })
        .setLatLng(e.latlng)
        .setContent(
          `<div class="popup-body">${nameHtml}` +
          `<button data-gid="${g.id}" class="btn-del-graphic" style="font-size:12px;padding:4px 12px;` +
          `background:rgba(248,81,73,0.2);color:#f85149;border:1px solid rgba(248,81,73,0.4);` +
          `border-radius:6px;cursor:pointer">Delete</button></div>`
        )
        .addTo(this._map)
        .openOn(this._map);

      setTimeout(() => {
        document.querySelectorAll(`.btn-del-graphic[data-gid="${g.id}"]`).forEach(btn => {
          btn.addEventListener('click', () => {
            this._graphicLayer.removeLayer(group);
            delete this._graphics[g.id];
            LocalStore.deleteGraphic(g.id);
            if (Mission.active) DB.deleteGraphic(g.id).catch(() => {});
            this._map.closePopup();
          });
        });
      }, 40);
    });

    group.addTo(this._graphicLayer);
    this._graphics[g.id] = { data: g, layer: group };
  },

  _geomCenter(geo) {
    try {
      if (geo.type === 'LineString') {
        const mid = geo.coordinates[Math.floor(geo.coordinates.length / 2)];
        return [mid[1], mid[0]];
      }
      if (geo.type === 'Polygon') {
        const ring = geo.coordinates[0];
        const lat  = ring.reduce((s, c) => s + c[1], 0) / ring.length;
        const lng  = ring.reduce((s, c) => s + c[0], 0) / ring.length;
        return [lat, lng];
      }
    } catch {}
    return null;
  },

  async _saveGraphic(partial) {
    const graphic = {
      id:         crypto.randomUUID(),
      mission_id: Mission.active ? Mission.current.id : null,
      type:       partial.type,
      geometry:   partial.geometry,
      style:      partial.style || {},
      created_by: Auth.user?.id,
      updated_at: new Date().toISOString(),
    };
    this._renderGraphic(graphic);
    LocalStore.upsertGraphic(graphic);
    if (Mission.active) {
      DB.upsertGraphic(graphic).catch(e => UI.toast('Save failed: ' + e.message, 'error'));
    }
  },

  // ── Measure ──────────────────────────────────────────────
  _drawMeasurePt(latlng) {
    L.circleMarker(latlng, { radius: 5, color: '#d29922', fillColor: '#d29922', fillOpacity: 1 })
      .addTo(this._measureLayer);
  },

  _computeMeasure() {
    const [a, b] = this._measurePts;
    this._drawMeasurePt(b);
    L.polyline([a, b], { color: '#d29922', weight: 2, dashArray: '6,4' }).addTo(this._measureLayer);

    const dist  = this._map.distance(a, b);
    const az    = this._bearing(a, b);
    const mgrsA = toMGRS(a.lat, a.lng, 4) || '—';
    const mgrsB = toMGRS(b.lat, b.lng, 4) || '—';

    document.getElementById('m-distance').textContent =
      dist >= 1000 ? (dist / 1000).toFixed(2) + ' km' : Math.round(dist) + ' m';
    document.getElementById('m-azimuth').textContent  = az.toFixed(1) + '°';
    document.getElementById('m-from').textContent     = mgrsA;
    document.getElementById('m-to').textContent       = mgrsB;

    this._measurePts = [];
  },

  clearMeasure() {
    this._measureLayer.clearLayers();
    this._measurePts = [];
    ['m-distance','m-azimuth','m-from','m-to'].forEach(id =>
      document.getElementById(id).textContent = '—');
  },

  _bearing(a, b) {
    const la = a.lat * Math.PI / 180, lb = b.lat * Math.PI / 180;
    const dl = (b.lng - a.lng) * Math.PI / 180;
    const y  = Math.sin(dl) * Math.cos(lb);
    const x  = Math.cos(la) * Math.sin(lb) - Math.sin(la) * Math.cos(lb) * Math.cos(dl);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
  },

  // ── Basemap ──────────────────────────────────────────────
  setBasemap(key) {
    if (!BASEMAPS[key] || key === this._currentBase) return;
    this._map.removeLayer(this._basemap);
    const bm = BASEMAPS[key];
    this._basemap = L.tileLayer(bm.url, bm.opts).addTo(this._map);
    this._basemap.bringToBack();
    this._currentBase = key;
  },

  // ── Self position ────────────────────────────────────────
  showSelf(lat, lng) {
    const latlng = L.latLng(lat, lng);
    if (this._selfMarker) {
      this._selfMarker.setLatLng(latlng);
    } else {
      this._selfMarker = L.marker(latlng, {
        icon: L.divIcon({ html: '<div class="self-dot"></div>', className: '', iconSize: [16,16], iconAnchor: [8,8] }),
        zIndexOffset: 1000,
      }).addTo(this._map);
    }
    const mgrsStr = toMGRS(lat, lng, 5) || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    document.getElementById('coord-mgrs').textContent = mgrsStr;
  },

  panTo(lat, lng, zoom) {
    if (zoom) this._map.setView([lat, lng], zoom);
    else this._map.panTo([lat, lng]);
  },

  setGridVisible(v) {
    v ? this._grid.show() : this._grid.hide();
  },

  loadLocalData() {
    this._unitLayer.clearLayers();
    this._graphicLayer.clearLayers();
    this._reportLayer.clearLayers();
    this._units    = {};
    this._graphics = {};
    const units    = LocalStore.getUnits();
    const graphics = LocalStore.getGraphics();
    const reports  = LocalStore.getReports();
    for (const u of units)   this._addUnitMarker(u);
    for (const g of graphics) this._renderGraphic(g);
    for (const r of reports)  this.placeReportMarker(r);
    if (units.length || graphics.length) {
      UI.toast(`Loaded ${units.length} unit${units.length !== 1 ? 's' : ''}, ${graphics.length} graphic${graphics.length !== 1 ? 's' : ''}`, 'info');
    }
  },

  // ── LACE / REDCON updates ────────────────────────────────
  updateUnitLACE(id, lace) {
    const entry = this._units[id];
    if (!entry) return;
    entry.data.lace      = lace;
    entry.data.updated_at = new Date().toISOString();
    LocalStore.upsertUnit(entry.data);
    if (Mission.active) DB.upsertUnit(entry.data).catch(() => {});
  },

  // ── Report markers ────────────────────────────────────────
  placeReportMarker(report) {
    if (report.lat == null || report.lng == null) return;

    const isHostile = report.type === 'SPOTREP';
    const isMedevac = report.type === '9LINE';
    const cls       = isHostile ? 'hostile' : isMedevac ? 'medevac' : 'generic';
    const glyph     = isHostile ? '✕' : isMedevac ? '✚' : '!';

    const icon = L.divIcon({
      html:       `<div class="report-pin ${cls}">${glyph}</div>`,
      className:  '',
      iconSize:   [28, 28],
      iconAnchor: [14, 14],
    });

    const marker = L.marker([report.lat, report.lng], { icon, zIndexOffset: 600, interactive: true });

    marker.on('click', () => {
      if (this._activeTool !== 'select') return;
      const d = report.data || {};
      let body = `<div class="popup-body"><div class="popup-name">${report.type}</div>`;
      if (report.mgrs) body += `<div class="popup-mgrs">${report.mgrs}</div>`;
      if (report.type === 'SPOTREP') {
        body += `<table class="popup-table">`;
        if (d.size)     body += `<tr><td>S</td><td>${_escH(d.size)}</td></tr>`;
        if (d.activity) body += `<tr><td>A</td><td>${_escH(d.activity)}</td></tr>`;
        if (d.time)     body += `<tr><td>T</td><td>${_escH(d.time)}</td></tr>`;
        if (d.equip)    body += `<tr><td>E</td><td>${_escH(d.equip)}</td></tr>`;
        body += `</table>`;
      } else if (report.type === '9LINE') {
        body += `<table class="popup-table">`;
        body += `<tr><td>L1</td><td>${_escH(d.line1 || '')}</td></tr>`;
        body += `<tr><td>L3</td><td>${_escH(d.line3 || '')}</td></tr>`;
        body += `<tr><td>L5</td><td>${_escH(d.line5 || '')}</td></tr>`;
        body += `</table>`;
      }
      body += `<button class="btn-del-report" data-rid="${report.id}" style="font-size:11px;margin-top:8px;padding:4px 12px;` +
              `background:rgba(248,81,73,0.2);color:#f85149;border:1px solid rgba(248,81,73,0.4);border-radius:6px;cursor:pointer">Remove</button>`;
      body += `</div>`;

      L.popup({ closeButton: true, autoPan: false })
        .setLatLng([report.lat, report.lng])
        .setContent(body)
        .addTo(this._map)
        .openOn(this._map);

      setTimeout(() => {
        document.querySelectorAll(`.btn-del-report[data-rid="${report.id}"]`).forEach(btn => {
          btn.addEventListener('click', () => {
            this._reportLayer.removeLayer(marker);
            LocalStore.deleteReport(report.id);
            this._map.closePopup();
          });
        });
      }, 40);
    });

    marker.addTo(this._reportLayer);
  },

  get map() { return this._map; },
};
