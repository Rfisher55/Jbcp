const Auth = {
  user: null,
  callsign: null,

  get signedIn() { return !!this.user; },

  async init() {
    const stored = localStorage.getItem('cop_auth');
    if (stored) {
      try {
        const p = JSON.parse(stored);
        this.user = p.user;
        this.callsign = p.callsign;
        return true;
      } catch {}
    }
    const session = await DB.getSession();
    if (session?.user) {
      this.user = session.user;
      this.callsign = session.user.user_metadata?.callsign || 'UNKNOWN';
      this._save();
      return true;
    }
    return false;
  },

  async signIn(callsign, email) {
    callsign = callsign.trim().replace(/\s+/g, '-').toUpperCase();
    if (!callsign) throw new Error('Callsign is required.');

    if (email && email.trim()) {
      await DB.signInEmail(email.trim(), callsign);
      return { otpSent: true };
    }

    const data = await DB.signInAnon(callsign);
    this.user = data.user;
    this.callsign = callsign;
    this._save();
    return { otpSent: false };
  },

  _save() {
    localStorage.setItem('cop_auth', JSON.stringify({
      user: this.user,
      callsign: this.callsign
    }));
  }
};
