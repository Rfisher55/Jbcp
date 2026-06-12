const Mission = {
  current:        null,
  _unsub:         null,
  _trackPresence: null,   // fn(data) → updates our presence state in the mission channel

  get active() { return !!this.current; },

  async create(name) {
    name = name.trim();
    if (!name) throw new Error('Mission name is required.');
    if (!Auth.user) throw new Error('Not signed in.');
    const m = await DB.createMission(name, Auth.user.id);
    await DB.joinMission(m.id, Auth.user.id, Auth.callsign, 'commander');
    return this._activate(m);
  },

  async join(code) {
    if (!Auth.user) throw new Error('Not signed in.');
    code = code.trim().replace(/-/g, '');
    // Short code (≤8 chars) is a join-code prefix; full UUID (>8) is used directly
    const m = code.length <= 8
      ? await DB.findMissionByCode(code)
      : await DB.getMission(code);
    if (!m) throw new Error('Mission not found. Check the code and try again.');
    await DB.joinMission(m.id, Auth.user.id, Auth.callsign, 'editor');
    return this._activate(m);
  },

  async restore() {
    let stored;
    try { stored = localStorage.getItem('cop_mission'); } catch { return null; }
    if (!stored) return null;
    try {
      const saved = JSON.parse(stored);
      if (DB.online) {
        const m = await DB.getMission(saved.id);
        if (m) return this._activate(m, { silent: true });
      }
      // Offline fallback: use stored mission object directly
      if (saved.id && saved.name) {
        return this._activate(saved, { silent: true });
      }
    } catch {}
    try { localStorage.removeItem('cop_mission'); } catch {}
    return null;
  },

  leave() {
    if (this._unsub) { this._unsub(); this._unsub = null; }
    this._trackPresence = null;
    this.current = null;
    try { localStorage.removeItem('cop_mission'); } catch {}
  },

  updatePresenceMGRS(mgrs) {
    if (this._trackPresence) {
      this._trackPresence({ callsign: Auth.callsign || 'Unknown', mgrs: mgrs || '' });
    }
  },

  _activate(m, { silent = false } = {}) {
    this.current = m;
    try { localStorage.setItem('cop_mission', JSON.stringify({ id: m.id, name: m.name, status: m.status })); } catch {}

    // Subscribe to live changes
    if (this._unsub) this._unsub();
    const sub = DB.subscribeMission(m.id, {
      onUnit:     p => MapCtrl.handleRemoteUnit(p),
      onGraphic:  p => MapCtrl.handleRemoteGraphic(p),
      onPresence: s => UI.updateRoster(s),
    });
    this._unsub         = sub.unsub;
    this._trackPresence = sub.track;

    if (!silent) App.onMissionActivated(m);
    return m;
  }
};
