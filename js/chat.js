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
    'CONTACT — WAIT OUT',
    'ALL CLEAR — SECURE',
    'MEDEVAC REQUEST FOLLOWS',
    'AMMO LOW — REQUEST RESUPPLY',
  ],

  join(missionId) {
    this.leave();
    if (!DB.online) return;

    this._msgs   = [];
    this._unread = 0;

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
    this._msgs   = [];
    this._unread = 0;
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
    this._msgs.push(msg);
    if (this._msgs.length > this.MAX) this._msgs.shift();

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
      (msg.mgrs ? `<span class="chat-grid">${_escH(msg.mgrs)}</span>` : '') +
      `<span class="chat-time">${time}</span></div>` +
      `<div class="chat-text">${_escH(msg.text)}</div>`;
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
  },

  _refreshBadge() {
    const b = document.getElementById('chat-badge');
    if (!b) return;
    b.textContent   = this._unread > 9 ? '9+' : (this._unread || '');
    b.style.display = this._unread > 0 ? 'flex' : 'none';
  },

  isJoined() { return this._channel !== null; }
};
