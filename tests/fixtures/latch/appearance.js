/** Review-only accents and presentation finishes. No material certification is implied. */
export const PALETTES = Object.freeze([
  { id: 'ember', name: 'Ember', description: 'Orange-red', accent: '#ff6840' },
  { id: 'laser-red', name: 'Laser red', description: 'Fluorescent red', accent: '#ff3b5c' },
  { id: 'amber', name: 'Amber', description: 'Electric amber', accent: '#ffb52e' },
  { id: 'volt-yellow', name: 'Volt yellow', description: 'Fluorescent yellow', accent: '#edff33' },
  { id: 'acid-lime', name: 'Acid lime', description: 'Acid yellow-green', accent: '#b6ff2e' },
  { id: 'signal-green', name: 'Signal green', description: 'Electric green', accent: '#00f5a0' },
  { id: 'arc-cyan', name: 'Arc cyan', description: 'Electric cyan', accent: '#00e5ff' },
  { id: 'ion-blue', name: 'Ion blue', description: 'Electric blue', accent: '#4385ff' },
  { id: 'plasma-violet', name: 'Plasma violet', description: 'Electric violet', accent: '#b66bff' },
  { id: 'magenta', name: 'Magenta', description: 'Fluorescent magenta', accent: '#ff3ed1' }
].map(palette => Object.freeze(palette)));

const PANEL = '#211e24';
const normalizeHex = value => typeof value === 'string' && /^#[a-f\d]{6}$/i.test(value) ? value.toLowerCase() : null;
const channels = value => [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16));
const hex = rgb => '#' + rgb.map(value => Math.round(value).toString(16).padStart(2, '0')).join('');
const linearChannel = value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
const linearRGB = rgb => rgb.map(value => linearChannel(value / 255));
const luminance = rgb => linearRGB(rgb).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
const composite = (foreground, background, alpha) => foreground.map((value, index) => value * alpha + background[index] * (1 - alpha));

export function resolvePalette(id, customAccent) {
  const custom = normalizeHex(customAccent);
  if (id === 'custom' && custom) return Object.freeze({ id: 'custom', name: 'Custom', description: 'Client accent', accent: custom });
  return PALETTES.find(palette => palette.id === id) || PALETTES[0];
}

export function paletteRoles(palette) {
  const accent = normalizeHex(palette?.accent) || PALETTES[0].accent;
  const rgb = channels(accent), panel = channels(PANEL);
  const washAlpha = .10, strongAlpha = .16;
  // Text must remain readable on both inactive and selected surfaces. The original
  // accent remains unchanged for swatches and contours; only text is adjusted.
  let readable = [...rgb];
  for (let step = 0; step < 255; step++) {
    if ([panel, composite(rgb, panel, washAlpha), composite(rgb, panel, strongAlpha)].every(surface => contrast(readable, surface) >= 4.5)) break;
    readable = readable.map(value => Math.min(255, value + 1));
  }
  const content = hex(readable), joined = rgb.join(', ');
  const roles = {
    accent, content, rgb: joined,
    wash: `rgba(${joined}, ${washAlpha})`,
    strong: `rgba(${joined}, ${strongAlpha})`,
    border: `rgba(${readable.join(', ')}, 0.48)`,
    // sRGB hex is suitable for THREE.Color.set(). outlineLinear is the standard
    // sRGB-to-linear conversion for raw shader uniforms. Do not apply both.
    // An outline composed before tone mapping remains affected by that pass;
    // exact display accents belong in an untonemapped overlay after it.
    outline: accent,
    outlineLinear: linearRGB(rgb),
    onAccent: '#171519'
  };
  roles.cssTokens = {
    '--accent': roles.content,
    '--accent-raw': roles.accent,
    '--accent-rgb': roles.rgb,
    '--accent-light': roles.content,
    '--accent-wash': roles.wash,
    '--accent-border': roles.border,
    '--accent-strong': roles.strong,
    '--on-accent': roles.onAccent
  };
  return roles;
}

export const FINISHES = Object.freeze({
  satin: Object.freeze({ family: 'satin', label: 'Satin silver', color: '#b8bec7', metalness: .62, roughness: .47 }),
  machined: Object.freeze({ family: 'machined', label: 'Dark machined', color: '#5c626a', metalness: .74, roughness: .32 }),
  polished: Object.freeze({ family: 'polished', label: 'Bright hardware', color: '#e1e5e9', metalness: .85, roughness: .20 })
});

// All 20 source meshes are tagged "Brushed steel". These ID-bound choices are
// art direction for this small finish study, not inferred alloy or BOM records.
// The broad body is darker; blocks remain satin; rods and small round forms are
// brighter. Source material names stay available independently in the metadata.
const LATCH_FINISH = Object.freeze({
  part_0002: 'satin', part_0034: 'machined', part_0063: 'polished',
  part_0089: 'satin', part_0115: 'satin', part_0141: 'satin',
  part_0167: 'satin', part_0193: 'satin', part_0220: 'satin',
  part_0246: 'satin', part_0272: 'satin', part_0298: 'satin',
  part_0325: 'polished', part_0467: 'satin', part_0517: 'polished',
  part_0552: 'polished', part_0582: 'polished', part_0696: 'polished',
  part_0728: 'polished', part_0754: 'satin'
});

const SOURCE_FINISHES = Object.freeze({
  'Brushed steel': FINISHES.satin,
  'Polished steel': FINISHES.polished,
  'Satin aluminum': FINISHES.satin,
  'Polymer and seals': Object.freeze({ family: 'polymer', label: 'Dark polymer', color: '#292c30', metalness: 0, roughness: .76 }),
  'Window glass': Object.freeze({ family: 'glass', label: 'Smoked glazing', color: '#34454c', metalness: .12, roughness: .12 }),
  'Bronze bearing': Object.freeze({ family: 'bronze', label: 'Warm metal', color: '#b79a64', metalness: .70, roughness: .34 }),
  'Release indicator': Object.freeze({ family: 'indicator', label: 'Indicator finish', color: '#b5533f', metalness: .08, roughness: .48 })
});

export function materialSpec(sourceMaterialName, meshName) {
  const curated = LATCH_FINISH[meshName];
  const spec = curated ? FINISHES[curated] : SOURCE_FINISHES[sourceMaterialName] || FINISHES.satin;
  return { ...spec, sourceMaterial: typeof sourceMaterialName === 'string' ? sourceMaterialName : 'Unspecified', illustrative: true };
}

export function technicalSpec() {
  return { color: '#15171b', metalness: 0, roughness: 1, lineColor: '#b9bec5', lineOpacity: .82 };
}
