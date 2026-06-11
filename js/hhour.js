// H-Hour countdown timer
const HHour = {
  _ms:       null,   // epoch ms of H-Hour
  _interval: null,
  _KEY:      'hhour_ms',

  init() {
    try {
      const saved = localStorage.getItem(this._KEY);
      if (saved) this._ms = parseInt(saved, 10);
    } catch {}
    this._start();
    this._tick();
  },

  set(ms) {
    this._ms = ms;
    try { localStorage.setItem(this._KEY, String(ms)); } catch {}
    this._tick();
  },

  getTime() { return this._ms; },

  clear() {
    this._ms = null;
    try { localStorage.removeItem(this._KEY); } catch {}
    this._tick();
  },

  _start() {
    if (this._interval) return;
    this._interval = setInterval(() => this._tick(), 1000);
  },

  _tick() {
    const chip  = document.getElementById('hhour-chip');
    const label = document.getElementById('hhour-label');
    if (!chip || !label) return;

    if (!this._ms) {
      chip.classList.remove('past', 'countdown', 'imminent');
      chip.classList.add('hidden');
      return;
    }

    chip.classList.remove('hidden');
    const diff = this._ms - Date.now();
    const absDiff = Math.abs(diff);
    const h   = Math.floor(absDiff / 3600000);
    const m   = Math.floor((absDiff % 3600000) / 60000);
    const s   = Math.floor((absDiff % 60000) / 1000);
    const hh  = String(h).padStart(2, '0');
    const mm  = String(m).padStart(2, '0');
    const ss  = String(s).padStart(2, '0');

    chip.classList.remove('past', 'countdown', 'imminent');

    if (diff < 0) {
      // H-Hour passed
      label.textContent = `H+${hh}:${mm}:${ss}`;
      chip.classList.add('past');
    } else if (diff <= 300000) {
      // ≤ 5 min out — imminent
      label.textContent = `H-${mm}:${ss}`;
      chip.classList.add('imminent');
    } else {
      // Counting down
      label.textContent = h > 0 ? `H-${hh}:${mm}:${ss}` : `H-${mm}:${ss}`;
      chip.classList.add('countdown');
    }
  }
};
