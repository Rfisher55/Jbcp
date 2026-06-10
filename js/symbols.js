// milsymbol catalog and icon factory

const CATALOG = [
  // ── Ground Combat — Friendly ──────────────────────────
  { id: 'inf',        name: 'Infantry',         base: 'SFGPUCI----', cat: 'F' },
  { id: 'armor',      name: 'Armor',            base: 'SFGPUCA----', cat: 'F' },
  { id: 'mech',       name: 'Mech Infantry',    base: 'SFGPUCL----', cat: 'F' },
  { id: 'arty',       name: 'Artillery',        base: 'SFGPUCF----', cat: 'F' },
  { id: 'ada',        name: 'Air Defense',      base: 'SFGPUCAA---', cat: 'F' },
  { id: 'engr',       name: 'Engineer',         base: 'SFGPUCE----', cat: 'F' },
  { id: 'recon',      name: 'Reconnaissance',   base: 'SFGPUCR----', cat: 'F' },
  { id: 'airborne',   name: 'Airborne',         base: 'SFGPUCIB---', cat: 'F' },
  { id: 'airasslt',   name: 'Air Assault',      base: 'SFGPUCIA---', cat: 'F' },
  { id: 'sf',         name: 'Special Forces',   base: 'SFGPUCSF---', cat: 'F' },
  { id: 'ranger',     name: 'Ranger',           base: 'SFGPUCSR---', cat: 'F' },
  { id: 'at',         name: 'Anti-Tank',        base: 'SFGPUCAT---', cat: 'F' },
  { id: 'cbrn',       name: 'CBRN',             base: 'SFGPUCN----', cat: 'F' },
  { id: 'mp',         name: 'Military Police',  base: 'SFGPUSP----', cat: 'F' },
  // ── C2 & Support — Friendly ──────────────────────────
  { id: 'hq',         name: 'Headquarters',     base: 'SFGPUH-----', cat: 'F' },
  { id: 'sig',        name: 'Signal',           base: 'SFGPUSC----', cat: 'F' },
  { id: 'intel',      name: 'Intelligence',     base: 'SFGPUSI----', cat: 'F' },
  { id: 'med',        name: 'Medical',          base: 'SFGPUSM----', cat: 'F' },
  { id: 'log',        name: 'Logistics',        base: 'SFGPUSS----', cat: 'F' },
  { id: 'trans',      name: 'Transportation',   base: 'SFGPUST----', cat: 'F' },
  { id: 'ord',        name: 'Ordnance',         base: 'SFGPUSO----', cat: 'F' },
  { id: 'fa-cp',      name: 'FA Fire Direc.',   base: 'SFGPUCFH---', cat: 'F' },
  // ── Aviation — Friendly ──────────────────────────────
  { id: 'atk-helo',   name: 'Attack Helo',      base: 'SFAPWMA----', cat: 'F' },
  { id: 'util-helo',  name: 'Utility Helo',     base: 'SFAPMF-----', cat: 'F' },
  { id: 'recon-air',  name: 'Recon Aircraft',   base: 'SFAPMFR----', cat: 'F' },
  { id: 'cas',        name: 'Fixed Wing Atk',   base: 'SFAPWF-----', cat: 'F' },
  // ── Enemy / Hostile ──────────────────────────────────
  { id: 'h-inf',      name: 'Infantry',         base: 'SHGPUCI----', cat: 'H' },
  { id: 'h-armor',    name: 'Armor',            base: 'SHGPUCA----', cat: 'H' },
  { id: 'h-mech',     name: 'Mech Infantry',    base: 'SHGPUCL----', cat: 'H' },
  { id: 'h-arty',     name: 'Artillery',        base: 'SHGPUCF----', cat: 'H' },
  { id: 'h-ada',      name: 'Air Defense',      base: 'SHGPUCAA---', cat: 'H' },
  { id: 'h-engr',     name: 'Engineer',         base: 'SHGPUCE----', cat: 'H' },
  { id: 'h-recon',    name: 'Reconnaissance',   base: 'SHGPUCR----', cat: 'H' },
  { id: 'h-hq',       name: 'Headquarters',     base: 'SHGPUH-----', cat: 'H' },
  { id: 'h-vehicle',  name: 'Armored Vehicle',  base: 'SHGPEV-----', cat: 'H' },
  { id: 'h-at',       name: 'Anti-Tank',        base: 'SHGPUCAT---', cat: 'H' },
  { id: 'h-arcraft',  name: 'Aircraft',         base: 'SHAPWF-----', cat: 'H' },
  { id: 'h-log',      name: 'Log Site',         base: 'SHGPUSS----', cat: 'H' },
  // ── Neutral ──────────────────────────────────────────
  { id: 'n-unit',     name: 'Unit',             base: 'SNGPUC-----', cat: 'N' },
  { id: 'n-civilian', name: 'Civilian',         base: 'SNGPE------', cat: 'N' },
  { id: 'n-vehicle',  name: 'Vehicle',          base: 'SNGPEV-----', cat: 'N' },
  // ── Unknown ──────────────────────────────────────────
  { id: 'u-gnd',      name: 'Unknown Ground',   base: 'SUGPUC-----', cat: 'U' },
  { id: 'u-air',      name: 'Unknown Air',      base: 'SUAP-------', cat: 'U' },
  { id: 'u-vehicle',  name: 'Unknown Vehicle',  base: 'SUGPEV-----', cat: 'U' },
];

// Tactical graphic types for planning overlays
const GRAPHIC_CATALOG = [
  // Lines
  { id: 'phase-line',   name: 'Phase Line',           type: 'line', color: '#ff4444', dash: '10,5',  weight: 2.5, label: 'PL',   cat: 'LN' },
  { id: 'boundary',     name: 'Boundary',             type: 'line', color: '#6688ff', dash: null,    weight: 2,   label: 'BDRY', cat: 'LN' },
  { id: 'ld',           name: 'Line of Departure',    type: 'line', color: '#00cc55', dash: '8,5',   weight: 2.5, label: 'LD',   cat: 'LN' },
  { id: 'lc',           name: 'Line of Contact',      type: 'line', color: '#ff8800', dash: null,    weight: 2,   label: 'LC',   cat: 'LN' },
  { id: 'flot',         name: 'FLOT',                 type: 'line', color: '#0088ff', dash: null,    weight: 3,   label: 'FLOT', cat: 'LN' },
  { id: 'feba',         name: 'FEBA',                 type: 'line', color: '#ff0000', dash: null,    weight: 3,   label: 'FEBA', cat: 'LN' },
  { id: 'axis',         name: 'Axis of Advance',      type: 'line', color: '#0044cc', dash: null,    weight: 3,   label: 'AA',   cat: 'LN' },
  { id: 'msr',          name: 'Main Supply Route',    type: 'line', color: '#ffaa00', dash: '12,4',  weight: 2,   label: 'MSR',  cat: 'LN' },
  { id: 'asr',          name: 'Alt Supply Route',     type: 'line', color: '#ffdd44', dash: '8,6',   weight: 2,   label: 'ASR',  cat: 'LN' },
  { id: 'line',         name: 'Generic Line',         type: 'line', color: '#58a6ff', dash: null,    weight: 2,   label: '',     cat: 'LN' },
  // Areas
  { id: 'objective',    name: 'Objective',            type: 'area', color: '#0044cc', fill: 0.12, weight: 2, dash: null,  label: 'OBJ',   cat: 'AR' },
  { id: 'assembly-area',name: 'Assembly Area',        type: 'area', color: '#0088ff', fill: 0.08, weight: 2, dash: '6,4', label: 'AA',    cat: 'AR' },
  { id: 'ea',           name: 'Engagement Area',      type: 'area', color: '#ff2222', fill: 0.10, weight: 2, dash: null,  label: 'EA',    cat: 'AR' },
  { id: 'nai',          name: 'Named Area of Int.',   type: 'area', color: '#ffaa00', fill: 0.07, weight: 1.5, dash: '5,4', label: 'NAI', cat: 'AR' },
  { id: 'tai',          name: 'Target Area of Int.',  type: 'area', color: '#ff4400', fill: 0.10, weight: 1.5, dash: '4,4', label: 'TAI', cat: 'AR' },
  { id: 'ao',           name: 'Area of Operations',   type: 'area', color: '#00aaff', fill: 0.05, weight: 2, dash: '10,6', label: 'AO',  cat: 'AR' },
  { id: 'bp',           name: 'Battle Position',      type: 'area', color: '#0066cc', fill: 0.10, weight: 2, dash: null,  label: 'BP',    cat: 'AR' },
  { id: 'area',         name: 'Generic Area',         type: 'area', color: '#d29922', fill: 0.10, weight: 2, dash: null,  label: '',      cat: 'AR' },
];

const ECHELONS = {
  '':  '-',
  'A': 'A', // Team/Crew
  'B': 'B', // Squad
  'C': 'C', // Section
  'D': 'D', // Platoon
  'E': 'E', // Company
  'F': 'F', // Battalion
  'G': 'G', // Regiment/Group
  'H': 'H', // Brigade
  'I': 'I', // Division
  'J': 'J', // Corps
  'K': 'K', // Army
};

function buildSIDC(base, echelon = '') {
  const padded = (base + '---------------').slice(0, 15);
  const arr    = padded.split('');
  arr[10] = ECHELONS[echelon] || '-';
  return arr.join('');
}

function makeMilIcon(sidc, size = 36) {
  try {
    const sym    = new ms.Symbol(sidc, { size, frame: true });
    const anchor = sym.getAnchor();
    const sz     = sym.getSize();
    return L.icon({
      iconUrl:    sym.toDataURL(),
      iconSize:   [sz.width,  sz.height],
      iconAnchor: [anchor.x,  anchor.y],
      popupAnchor:[0, -anchor.y + 4],
    });
  } catch {
    return L.icon({
      iconUrl: 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">'
        + '<rect width="32" height="32" fill="#333" rx="4"/>'
        + '<text x="16" y="22" font-size="18" text-anchor="middle" fill="#fff">?</text></svg>'
      ),
      iconSize: [32,32], iconAnchor: [16,16],
    });
  }
}

function catalogIcon(sidc, size = 40) {
  try {
    const sym = new ms.Symbol(sidc, { size, frame: true });
    const img = document.createElement('img');
    img.src = sym.toDataURL();
    img.width = size; img.height = size;
    return img;
  } catch {
    const img = document.createElement('img');
    img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="%23333" rx="4"/></svg>';
    return img;
  }
}
