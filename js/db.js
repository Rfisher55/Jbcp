let _client = null;

(function () {
  if (!SUPABASE_URL || SUPABASE_URL === 'YOUR_SUPABASE_URL') {
    console.warn('[DB] No Supabase URL — local-only mode.');
    return;
  }
  try {
    _client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    console.info('[DB] Supabase client ready.');
  } catch (e) {
    console.error('[DB] Init failed:', e);
  }
})();

const DB = {
  get client() { return _client; },
  get online()  { return _client !== null; },

  async getSession() {
    if (!this.online) return null;
    const { data } = await _client.auth.getSession();
    return data.session;
  },

  async signInAnon(callsign) {
    if (!this.online) {
      return { user: { id: 'local-' + crypto.randomUUID(), user_metadata: { callsign } } };
    }
    const { data, error } = await _client.auth.signInAnonymously({
      options: { data: { callsign } }
    });
    if (error) {
      // Anonymous auth not yet enabled in Supabase dashboard — degrade to local-only
      console.warn('[DB] Anon auth unavailable, using local mode:', error.message);
      _client = null;
      return { user: { id: 'local-' + crypto.randomUUID(), user_metadata: { callsign } } };
    }
    return data;
  },

  async signInEmail(email, callsign) {
    if (!this.online) throw new Error('Supabase not configured.');
    const { data, error } = await _client.auth.signInWithOtp({
      email,
      options: { data: { callsign }, shouldCreateUser: true }
    });
    if (error) throw error;
    return data;
  },

  onAuthChange(cb) {
    if (!this.online) return () => {};
    const { data: { subscription } } = _client.auth.onAuthStateChange(cb);
    return () => subscription.unsubscribe();
  },

  async createMission(name, userId) {
    if (!this.online) {
      return { id: crypto.randomUUID(), name, created_by: userId, status: 'active', created_at: new Date().toISOString() };
    }
    const { data, error } = await _client.from('missions')
      .insert({ name, created_by: userId, status: 'active' })
      .select().single();
    if (error) throw error;
    return data;
  },

  async getMission(id) {
    if (!this.online) return null;
    const { data, error } = await _client.from('missions').select().eq('id', id).single();
    if (error) return null;
    return data;
  },

  async getUserMissions(userId) {
    if (!this.online) return [];
    const { data, error } = await _client
      .from('mission_members')
      .select('missions(*), callsign, role')
      .eq('user_id', userId)
      .order('joined_at', { ascending: false });
    if (error) return [];
    return (data || []).map(r => ({ ...r.missions, my_role: r.role, my_callsign: r.callsign }));
  },

  async joinMission(missionId, userId, callsign, role = 'editor') {
    if (!this.online) return {};
    const { data, error } = await _client.from('mission_members')
      .upsert({ mission_id: missionId, user_id: userId, callsign, role }, { onConflict: 'mission_id,user_id' })
      .select().single();
    if (error) throw error;
    return data;
  },

  async getUnits(missionId) {
    if (!this.online) return [];
    const { data, error } = await _client.from('units').select().eq('mission_id', missionId);
    if (error) throw error;
    return data || [];
  },

  async upsertUnit(unit) {
    if (!this.online) return unit;
    const { data, error } = await _client.from('units').upsert(unit).select().single();
    if (error) throw error;
    return data;
  },

  async deleteUnit(id) {
    if (!this.online) return;
    const { error } = await _client.from('units').delete().eq('id', id);
    if (error) throw error;
  },

  async getGraphics(missionId) {
    if (!this.online) return [];
    const { data, error } = await _client.from('graphics').select().eq('mission_id', missionId);
    if (error) throw error;
    return data || [];
  },

  async upsertGraphic(graphic) {
    if (!this.online) return graphic;
    const { data, error } = await _client.from('graphics').upsert(graphic).select().single();
    if (error) throw error;
    return data;
  },

  async deleteGraphic(id) {
    if (!this.online) return;
    const { error } = await _client.from('graphics').delete().eq('id', id);
    if (error) throw error;
  },

  subscribeMission(missionId, { onUnit, onGraphic, onPresence } = {}) {
    if (!this.online) return () => {};
    const ch = _client.channel(`mission:${missionId}`, {
      config: { presence: { key: missionId } }
    });
    if (onUnit) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'units', filter: `mission_id=eq.${missionId}` }, onUnit);
    }
    if (onGraphic) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'graphics', filter: `mission_id=eq.${missionId}` }, onGraphic);
    }
    if (onPresence) {
      ch.on('presence', { event: 'sync' }, () => onPresence(ch.presenceState()));
      ch.on('presence', { event: 'join' }, () => onPresence(ch.presenceState()));
      ch.on('presence', { event: 'leave' }, () => onPresence(ch.presenceState()));
    }
    ch.subscribe();
    return () => _client.removeChannel(ch);
  },

  async broadcastPresence(channel, data) {
    if (!this.online || !channel) return;
    await channel.track(data);
  }
};
