const CATALOG = [
  { id: 'infantry',   name: 'Infantry',         base: 'SFGPUCI----', cat: 'F' },
  { id: 'armor',      name: 'Armor',            base: 'SFGPUCA----', cat: 'F' },
  { id: 'mech',       name: 'Mech. Infantry',   base: 'SFGPUCL----', cat: 'F' },
  { id: 'arty',       name: 'Artillery',        base: 'SFGPUCF----', cat: 'F' },
  { id: 'ada',        name: 'Air Defense',      base: 'SFGPUCAA---', cat: 'F' },
  { id: 'engr',       name: 'Engineer',         base: 'SFGPUCE----', cat: 'F' },
  { id: 'recon',      name: 'Reconnaissance',   base: 'SFGPUCR----', cat: 'F' },
  { id: 'aviation',   name: 'Aviation',         base: 'SFGPCA-----', cat: 'F' },
  { id: 'cp',         name: 'Command Post',     base: 'SFGPUH-----', cat: 'F' },
  { id: 'log',        name: 'Logistics',        base: 'SFGPUSS----', cat: 'F' },
  { id: 'medical',    name: 'Medical',          base: 'SFGPUSM----', cat: 'F' },
  { id: 'signal',     name: 'Signal',           base: 'SFGPUSS----', cat: 'F' },
  { id: 'h-infantry', name: 'Inf (Hostile)',    base: 'SHGPUCI----', cat: 'H' },
  { id: 'h-armor',    name: 'Armor (Hostile)',  base: 'SHGPUCA----', cat: 'H' },
  { id: 'h-arty',     name: 'Arty (Hostile)',   base: 'SHGPUCF----', cat: 'H' },
  { id: 'h-vehicle',  name: 'Vehicle (Hostile)',base: 'SHGPEV-----', cat: 'H' },
  { id: 'n-unit',     name: 'Unit (Neutral)',   base: 'SNGPUC-----', cat: 'N' },
  { id: 'n-civilian', name: 'Civilian',         base: 'SNGPE------', cat: 'N' },
  { id: 'unk-gnd',    name: 'Unknown Gnd',      base: 'SUGPUC-----', cat: 'U' },
  { id: 'unk-air',    name: 'Unknown Air',      base: 'SUAP-------', cat: 'U' },
];

const ECHELONS = { '': '-', 'A': 'A', 'B': 'B', 'C': 'C', 'D': 'D', 'E': 'E', 'F': 'F', 'G': 'G', 'H': 'H', 'I': 'I' };

function buildSIDC(base, echelon = '') {
  const padded = (base + '---------------').slice(0, 15);
  const arr = padded.split('');
  arr[10] = ECHELONS[echelon] || '-';
  return arr.join('');
}

function makeMilIcon(sidc, size = 36) {
  try {
    const sym = new ms.Symbol(sidc, { size, frame: true });
    const anchor = sym.getAnchor(), symSize = sym.getSize();
    return L.icon({ iconUrl: sym.toDataURL(), iconSize: [symSize.width, symSize.height], iconAnchor: [anchor.x, anchor.y], popupAnchor: [0, -anchor.y + 4] });
  } catch (e) {
    return L.icon({ iconUrl: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#333" rx="4"/><text x="16" y="22" font-size="18" text-anchor="middle" fill="#fff">?</text></svg>'), iconSize: [32, 32], iconAnchor: [16, 16] });
  }
}

function catalogIcon(sidc, size = 40) {
  try {
    const sym = new ms.Symbol(sidc, { size, frame: true });
    const img = document.createElement('img');
    img.src = sym.toDataURL(); img.width = size; img.height = size;
    return img;
  } catch {
    const img = document.createElement('img');
    img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="%23333" rx="4"/></svg>';
    return img;
  }
}
