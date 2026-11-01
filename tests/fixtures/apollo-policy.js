/** Authored presentation for the Smithsonian / Project Egress hatch package.
 * These are explanatory groups and finishes, not a manufacturer BOM or materials claim.
 * Keep model-specific names here; the shared hierarchy and renderer consume data only.
 */
export const APOLLO_POLICY = Object.freeze({
  root: {
    id: 'hatch', title: 'Crew hatch',
    description: 'Explore the interconnected hatch structure, drive mechanism and fifteen latch assemblies.',
  },
  subassemblyDescription: 'A source-model latch subassembly. Inspect its individual components, or separate them to reveal their spatial relationships.',
  spatialGrouping: {
    minimumParts: 40, axis: 1, splitAt: -2.5,
    upper: { id: 'upper', title: 'Upper components' },
    lower: { id: 'lower', title: 'Lower components' },
    description: 'Components grouped by their position in the source assembly. This is an exploration aid, not a manufacturing parts classification.',
  },
  explosion: {
    rootVectors: { shell: [0, 0, -.9], window: [0, .12, 1.5], handle: [-.85, -.12, 1.9], gearbox: [-.42, -.12, 1.1], linkages: [0, .05, .45], latches: [0, 0, 1] },
    radial: { group: 'latches', origin: [0, -2.5, 0], factors: [.22, .22, 0] },
    scopeFactors: { latches: [1, 1, .3] },
  },
  finishes: {
    eligibleSources: ['Brushed steel', 'Unspecified'],
    groups: {
      gearbox: { family: 'machined', basis: 'Curated drive-system finish' },
      shell: { family: 'structure', basis: 'Curated structural finish' },
    },
    sourceRoles: {
      group: 'latches', basis: 'Approved latch finish by source part role',
      families: {
        Body1: 'satin', 'Body1:1': 'machined', 'Body1:2': 'polished',
        'Body1:3': 'satin', 'Body1:4': 'polished', 'Body1:5': 'polished',
        'Body1:6': 'polished', 'Body1:7': 'polished', 'Body1:8': 'polished',
        'Body1:9': 'satin', 'Body1:10': 'polished', 'Body1:11': 'satin',
        'Body1:12': 'satin', 'Body1:13': 'satin', 'Body1:14': 'satin',
        'Body1:15': 'satin', 'Body1:16': 'satin', 'Body1:17': 'satin',
        'Body1:18': 'satin', 'Body1:19': 'satin',
      },
    },
  },
});
