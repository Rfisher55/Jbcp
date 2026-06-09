const BASEMAPS = {
  osm: { name: 'Street', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', opts: { attribution: '© OpenStreetMap contributors', maxZoom: 19 } },
  satellite: { name: 'Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', opts: { attribution: '© Esri, Maxar', maxZoom: 19 } },
  topo: { name: 'Topo', url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', opts: { attribution: 'USGS', maxZoom: 16 } },
};

const MapCtrl = {
  _map: null, _grid: null, _unitLayer: null, _graphicLayer: null,
  _selfMarker: null, _units: {}, _graphics: {}, _basemap: null,
  _activeTool: 'select', _drawPoints: [], _measurePts: [], _measureLayer: null,

  init() {
    this._map = L.map('map', { center: AO.center, zoom: AO.zoom, zoomControl: false, attributionControl: true });
    this._basemap = L.tileLayer(BASEMAPS.osm.url, BASEMAPS.osm.opts).addTo(this._map);
    this._currentBase = 'osm';
    this._unitLayer = L.featureGroup().addTo(this._map);
    this._graphicLayer = L.featureGroup().addTo(this._map);
    this._measureLayer = L.featureGroup().addTo(this._map);
    this._grid = createMGRSGrid().addTo(this._map);
    this._map.on('mousemove', e => {
      const s = toMGRS(e.latlng.lat, e.latlng.lng, 4);
      document.getElementById('mgrs-display').textContent = s || '──';
    });
    this._map.on('mouseout', () => { document.getElementById('mgrs-display').textContent = '──────────────'; });
    this._map.on('click', e => this._onMapClick(e));
    return this;
  },

  setTool(tool) {
    this._activeTool = tool; this._drawPoints = [];
    const mc = this._map.getContainer();
    mc.className = mc.className.replace(/cursor-\S+/g, '').trim();
    if (tool === 'place-unit') mc.classList.add('cursor-cell');
    if (tool === 'draw-line' || tool === 'draw-area' || tool === 'measure') mc.classList.add('cursor-crosshair');
    if (tool === 'measure') UI.showSheet('sheet-measure');
    if (tool === 'plot-grid') { UI.showSheet('sheet-plot-grid'); this._activeTool = 'select'; }
  },

  _onMapClick(e) {
    if (this._activeTool === 'place-unit') { this._pendingLatLng = e.latlng; UI.showSheet('sheet-symbols'); return; }
    if (this._activeTool === 'measure') { this._measurePts.push(e.latlng); if (this._measurePts.length === 2) this._computeMeasure(); else this._drawMeasurePt(e.latlng); return; }
    if (this._activeTool === 'draw-line') { this._drawPoints.push(e.latlng); if (this._drawPoints.length >= 2) this._finishLine(); return; }
    if (this._activeTool === 'draw-area') { this._drawPoints.push(e.latlng); if (this._drawPoints.length >= 3) this._finishArea(); return; }
  },

  async placeUnit(catalogEntry, echelon) {
    if (!this._pendingLatLng) return;
    const latlng = this._pendingLatLng; this._pendingLatLng = null;
    const sidc = buildSIDC(catalogEntry.base, echelon);
    const unit = { id: crypto.randomUUID(), mission_id: Mission.active ? Mission.current.id : null, sidc, callsign: catalogEntry.name, lat: latlng.lat, lng: latlng.lng, notes: '', created_by: Auth.user?.id, updated_at: new Date().toISOString() };
    this._addUnitMarker(unit);
    if (unit.mission_id) { try { await DB.upsertUnit(unit); } catch (e) { UI.toast('Save failed: ' + e.message, 'error'); } }
    this.setTool('select'); UI.toolBtn('select');
  },

  _addUnitMarker(unit) {
    const marker = L.marker([unit.lat, unit.lng], { icon: makeMilIcon(unit.sidc), draggable: true }).addTo(this._unitLayer);
    marker.on('click', () => this._openUnitDetail(unit.id));
    marker.on('dragend', e => this._onUnitDrag(unit.id, e));
    this._units[unit.id] = { data: unit, marker };
  },

  _openUnitDetail(id) {
    const u = this._units[id]; if (!u) return;
    UI.showUnitDetail(u.data, { onEdit: up => this._updateUnit(id, up), onDelete: () => this._deleteUnit(id) });
  },

  async _updateUnit(id, updates) {
    const entry = this._units[id]; if (!entry) return;
    Object.assign(entry.data, updates, { updated_at: new Date().toISOString() });
    if (updates.sidc) entry.marker.setIcon(makeMilIcon(updates.sidc));
    if (Mission.active) { try { await DB.upsertUnit(entry.data); } catch (e) { UI.toast('Update failed: ' + e.message, 'error'); } }
  },

  async _deleteUnit(id) {
    const entry = this._units[id]; if (!entry) return;
    this._unitLayer.removeLayer(entry.marker); delete this._units[id];
    if (Mission.active) { try { await DB.deleteUnit(id); } catch (e) { UI.toast('Delete failed: ' + e.message, 'error'); } }
    UI.closeSheet('sheet-unit');
  },

  async _onUnitDrag(id, e) {
    const entry = this._units[id]; if (!entry) return;
    const { lat, lng } = e.target.getLatLng();
    Object.assign(entry.data, { lat, lng, updated_at: new Date().toISOString() });
    if (Mission.active) { try { await DB.upsertUnit(entry.data); } catch {} }
  },

  handleRemoteUnit(payload) {
    const { eventType, new: row, old } = payload;
    if (eventType === 'DELETE') { const e = this._units[old.id]; if (e) { this._unitLayer.removeLayer(e.marker); delete this._units[old.id]; } }
    else { const ex = this._units[row.id]; if (ex) { ex.data = row; ex.marker.setLatLng([row.lat, row.lng]); ex.marker.setIcon(makeMilIcon(row.sidc)); } else { this._addUnitMarker(row); } }
  },

  handleRemoteGraphic(payload) {
    const { eventType, new: row, old } = payload;
    if (eventType === 'DELETE') { const g = this._graphics[old.id]; if (g) { this._graphicLayer.removeLayer(g.layer); delete this._graphics[old.id]; } }
    else { this._renderGraphic(row); }
  },

  async loadMission(missionId) {
    this._unitLayer.clearLayers(); this._graphicLayer.clearLayers();
    this._units = {}; this._graphics = {};
    const [units, graphics] = await Promise.all([DB.getUnits(missionId), DB.getGraphics(missionId)]);
    for (const u of units) this._addUnitMarker(u);
    for (const g of graphics) this._renderGraphic(g);
    UI.toast(`Loaded ${units.length} units`, 'info');
  },

  clearMission() { this._unitLayer.clearLayers(); this._graphicLayer.clearLayers(); this._units = {}; this._graphics = {}; },

  _renderGraphic(g) {
    const ex = this._graphics[g.id]; if (ex) this._graphicLayer.removeLayer(ex.layer);
    const geo = g.geometry, sty = g.style || {};
    const ds = { color: sty.color || '#58a6ff', weight: sty.weight || 2, opacity: 0.8, fillOpacity: 0.15 };
    let layer;
    if (geo.type === 'LineString') layer = L.polyline(geo.coordinates.map(c => [c[1], c[0]]), ds);
    else if (geo.type === 'Polygon') layer = L.polygon(geo.coordinates[0].map(c => [c[1], c[0]]), { ...ds, fill: true });
    else return;
    layer.addTo(this._graphicLayer);
    this._graphics[g.id] = { data: g, layer };
  },

  _finishLine() {
    const pts = this._drawPoints.splice(0);
    this._saveGraphic({ type: 'line', geometry: { type: 'LineString', coordinates: pts.map(p => [p.lng, p.lat]) }, style: { color: '#58a6ff' } });
    this.setTool('select'); UI.toolBtn('select');
  },

  _finishArea() {
    const pts = this._drawPoints.splice(0);
    this._saveGraphic({ type: 'area', geometry: { type: 'Polygon', coordinates: [[...pts.map(p => [p.lng, p.lat]), [pts[0].lng, pts[0].lat]]] }, style: { color: '#d29922', fill: true } });
    this.setTool('select'); UI.toolBtn('select');
  },

  async _saveGraphic(partial) {
    const graphic = { id: crypto.randomUUID(), mission_id: Mission.active ? Mission.current.id : null, ...partial, created_by: Auth.user?.id, updated_at: new Date().toISOString() };
    this._renderGraphic(graphic);
    if (Mission.active) { try { await DB.upsertGraphic(graphic); } catch (e) { UI.toast('Save failed: ' + e.message, 'error'); } }
  },

  _drawMeasurePt(latlng) { L.circleMarker(latlng, { radius: 5, color: '#d29922', fillColor: '#d29922', fillOpacity: 1 }).addTo(this._measureLayer); },

  _computeMeasure() {
    const [a, b] = this._measurePts;
    this._drawMeasurePt(b);
    L.polyline([a, b], { color: '#d29922', weight: 2, dashArray: '6,4' }).addTo(this._measureLayer);
    const dist = this._map.distance(a, b), az = this._bearing(a, b);
    document.getElementById('m-distance').textContent = dist >= 1000 ? (dist / 1000).toFixed(2) + ' km' : Math.round(dist) + ' m';
    document.getElementById('m-azimuth').textContent = az.toFixed(1) + '°';
    document.getElementById('m-from').textContent = toMGRS(a.lat, a.lng, 4) || '—';
    document.getElementById('m-to').textContent = toMGRS(b.lat, b.lng, 4) || '—';
    this._measurePts = [];
  },

  clearMeasure() {
    this._measureLayer.clearLayers(); this._measurePts = [];
    ['m-distance','m-azimuth','m-from','m-to'].forEach(id => document.getElementById(id).textContent = '—');
  },

  _bearing(a, b) {
    const la = a.lat * Math.PI / 180, lb = b.lat * Math.PI / 180, dl = (b.lng - a.lng) * Math.PI / 180;
    return ((Math.atan2(Math.sin(dl) * Math.cos(lb), Math.cos(la) * Math.sin(lb) - Math.sin(la) * Math.cos(lb) * Math.cos(dl)) * 180 / Math.PI) + 360) % 360;
  },

  setBasemap(key) {
    if (!BASEMAPS[key] || key === this._currentBase) return;
    this._map.removeLayer(this._basemap);
    const bm = BASEMAPS[key];
    this._basemap = L.tileLayer(bm.url, bm.opts).addTo(this._map);
    this._basemap.bringToBack(); this._currentBase = key;
  },

  showSelf(lat, lng) {
    const latlng = L.latLng(lat, lng);
    if (this._selfMarker) { this._selfMarker.setLatLng(latlng); }
    else {
      const icon = L.divIcon({ html: '<div class="self-dot"></div>', className: '', iconSize: [16, 16], iconAnchor: [8, 8] });
      this._selfMarker = L.marker(latlng, { icon, zIndexOffset: 1000 }).addTo(this._map);
    }
    document.getElementById('coord-mgrs').textContent = toMGRS(lat, lng, 5) || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  },

  panTo(lat, lng, zoom) { zoom ? this._map.setView([lat, lng], zoom) : this._map.panTo([lat, lng]); },
  setGridVisible(v) { v ? this._grid.show() : this._grid.hide(); },
  get map() { return this._map; },
};
