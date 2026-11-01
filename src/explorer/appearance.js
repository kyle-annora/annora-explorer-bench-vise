/** Shared illustrative finishes. Package-specific curation is injected as data. */
export const FINISHES = Object.freeze({
  structure: Object.freeze({ family: 'structure', label: 'Structural satin', color: '#9fa7b1', metalness: .55, roughness: .48 }),
  satin: Object.freeze({ family: 'satin', label: 'Satin silver', color: '#b8bec7', metalness: .62, roughness: .47 }),
  machined: Object.freeze({ family: 'machined', label: 'Dark machined', color: '#5c626a', metalness: .74, roughness: .32 }),
  polished: Object.freeze({ family: 'polished', label: 'Bright hardware', color: '#e1e5e9', metalness: .85, roughness: .20 }),
  polymer: Object.freeze({ family: 'polymer', label: 'Polymer and seals', color: '#292c30', metalness: 0, roughness: .76 }),
  glass: Object.freeze({ family: 'glass', label: 'Smoked glazing', color: '#34454c', metalness: .12, roughness: .12 }),
  bronze: Object.freeze({ family: 'bronze', label: 'Warm bearing finish', color: '#b79a64', metalness: .70, roughness: .34 }),
  indicator: Object.freeze({ family: 'indicator', label: 'Coated surround', color: '#a44b3b', metalness: .08, roughness: .48 })
});

const SOURCE_FINISH = Object.freeze({
  'Brushed steel': 'satin', 'Polished steel': 'polished',
  'Satin aluminum': 'structure', 'Polymer and seals': 'polymer',
  'Window glass': 'glass', 'Bronze bearing': 'bronze', 'Release indicator': 'indicator'
});

/** Pass the metadata record together with sourceMaterial: originalMaterial.name. */
export function materialSpec(record = {}, policy = {}) {
  record = record && typeof record === 'object' ? record : {};
  const sourceMaterial = typeof record.sourceMaterial === 'string' ? record.sourceMaterial : 'Unspecified';
  let family = Object.hasOwn(SOURCE_FINISH, sourceMaterial) ? SOURCE_FINISH[sourceMaterial] : 'satin';
  let basis = Object.hasOwn(SOURCE_FINISH, sourceMaterial) ? 'Prepared asset material label' : 'Neutral fallback';
  const rules = policy.finishes;
  if (rules?.eligibleSources?.includes(sourceMaterial)) {
    if (record.group === rules.sourceRoles?.group) {
      const role = typeof record.sourceName === 'string' ? record.sourceName.replace(/\.\d+$/, '') : '';
      if (Object.hasOwn(rules.sourceRoles.families, role)) {
        family = rules.sourceRoles.families[role]; basis = rules.sourceRoles.basis;
      }
    } else if (Object.hasOwn(rules.groups || {}, record.group)) {
      ({ family, basis } = rules.groups[record.group]);
    }
  }
  return { ...FINISHES[family], sourceMaterial, illustrative: true, basis };
}

export function technicalSpec() {
  return { color: '#15171b', metalness: 0, roughness: 1, lineColor: '#b9bec5', lineOpacity: .82 };
}
