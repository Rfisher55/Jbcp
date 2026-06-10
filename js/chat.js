// Mission GeoChat — real-time messaging via Supabase broadcast
const Chat = {
  _channel: null,
  _msgs:    [],
  _unread:  0,
  MAX:      200,

  CANNED: [
    'WILCO',
    'ROGER',
    'STAND BY',
    'MOVING NOW',
    'IN POSITION',
    'CONSOLIDATING',
    'CONTACT — WAIT OUT',
    'BREAK BREAK BREAK',
    'CEASE FIRE',
    'ALL CLEAR — SECURE',
    'PUSH TO ALTERNATE',
    'SEND YOUR TRAFFIC',
    'AUTHENTICATE',
    'MEDEVAC REQUEST FOLLOWS',
    'AMMO LOW — REQUEST RESUPPLY',
    'CASUALTY — WAIT OUT',
  ],

  _missionId: null,
  _STORE_MAX: 100,

  join(missionId) {
    this.leave();
    if (!DB.online) return;

    this._missionId = missionId;
    this._msgs      = this._loadStored(missionId);
    this._unread    = 0;

    this._channel = DB.client.channel(`chat:${missionId}`, {
      config: { broadcast: { self: true } }
    });

    this._channel.on('broadcast', { event: 'msg' }, ({ payload }) => this._receive(payload));
    this._channel.subscribe();
  },

  leave() {
    if (this._channel) {
      try { DB.client.removeChannel(this._channel); } catch {}
      this._channel = null;
    }
    this._msgs      = [];
    this._unread    = 0;
    this._missionId = null;
  },

  _loadStored(missionId) {
    try {
      return JSON.parse(localStorage.getItem(`cop_chat_${missionId}`) || '[]');
    } catch { return []; }
  },

  _saveStored() {
    if (!this._missionId) return;
    try {
      const recent = this._msgs.slice(-this._STORE_MAX);
      localStorage.setItem(`cop_chat_${this._missionId}`, JSON.stringify(recent));
    } catch {}
  },

  send(text) {
    if (!this._channel || !text.trim()) return false;
    const mgrs = document.getElementById('coord-mgrs')?.textContent || '';
    this._channel.send({
      type: 'broadcast',
      event: 'msg',
      payload: {
        id:       crypto.randomUUID(),
        callsign: Auth.callsign || 'Unknown',
        text:     text.trim().slice(0, 500),
        mgrs:     mgrs === 'No position' ? '' : mgrs,
        ts:       Date.now()
      }
    });
    return true;
  },

  _receive(msg) {
    if (msg.id && this._msgs.find(m => m.id === msg.id)) return;
    this._msgs.push(msg);
    if (this._msgs.length > this.MAX) this._msgs.shift();
    this._saveStored();

    const open = !document.getElementById('sheet-chat')?.classList.contains('hidden');
    if (open) {
      this._appendMsg(msg);
    } else {
      this._unread++;
      this._refreshBadge();
    }
    if (msg.callsign !== Auth.callsign) {
      UI.toast(`${_escH(msg.callsign)}: ${msg.text.slice(0, 60)}`, 'info', 3500);
    }
  },

  open() {
    this._unread = 0;
    this._refreshBadge();
    const list = document.getElementById('chat-msgs');
    if (list) {
      list.innerHTML = '';
      this._msgs.forEach(m => this._appendMsg(m, list));
      list.scrollTop = list.scrollHeight;
    }
    UI.showSheet('sheet-chat');
    setTimeout(() => document.getElementById('chat-input')?.focus(), 200);
  },

  _appendMsg(msg, container) {
    const list = container || document.getElementById('chat-msgs');
    if (!list) return;
    const self = msg.callsign === Auth.callsign;
    const time = new Date(msg.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const div  = document.createElement('div');
    div.className = `chat-msg${self ? ' self' : ''}`;
    div.innerHTML =
      `<div class="chat-header">` +
      `<span class="chat-cs">${_escH(msg.callsign)}</span>` +
      (msg.mgrs ? `<span class="chat-grid mgrs-tap-link" data-mgrs="${_escH(msg.mgrs)}">${_escH(msg.mgrs)}</span>` : '') +
      `<span class="chat-time">${time}</span></div>` +
      `<div class="chat-text">${_linkifyMGRS(msg.text)}</div>`;
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
  },

  // Detect MGRS-like tokens in message text and wrap them in tappable spans
  _linkifyMGRS: null,  // set below after function definition

  _refreshBadge() {
    const b = document.getElementById('chat-badge');
    if (!b) return;
    b.textContent   = this._unread > 9 ? '9+' : (this._unread || '');
    b.style.display = this._unread > 0 ? 'flex' : 'none';
  },

  clearHistory() {
    this._msgs   = [];
    this._unread = 0;
    if (this._missionId) {
      try { localStorage.removeItem(`cop_chat_${this._missionId}`); } catch {}
    }
    const list = document.getElementById('chat-msgs');
    if (list) list.innerHTML = '';
    this._refreshBadge();
  },

  isJoined() { return this._channel !== null; }
};

// Scan message text for MGRS coordinates and wrap matches in clickable spans.
// Pattern: 1-2 digit zone + zone letter + 2 letter 100km square + 4-10 even digits.
Chat._linkifyMGRS = function(text) {
  const RE = /\b(\d{1,2}[C-HJ-NP-X][A-Z]{2}\d{4,10})\b/gi;
  let result = '';
  let last = 0;
  let m;
  while ((m = RE.exec(text)) !== null) {
    const candidate = m[1];
    if (typeof parseMGRS === 'function') {
      const parsed = parseMGRS(candidate);
      if (!parsed.valid) { result += _escH(text.slice(last, RE.lastIndex)); last = RE.lastIndex; continue; }
    }
    result += _escH(text.slice(last, m.index));
    result += `<span class="chat-text-grid mgrs-tap-link" data-mgrs="${_escH(candidate)}">${_escH(candidate)}</span>`;
    last = RE.lastIndex;
  }
  result += _escH(text.slice(last));
  return result;
};
