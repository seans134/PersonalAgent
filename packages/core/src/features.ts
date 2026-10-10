// Product feature switches shared by web and mobile.
// Atlas is focused on students, so meal and workout tracking (and the insights
// built on them) are hidden. The code and stored data stay in place; flip this
// to true to bring them back on both surfaces.
export const features = {
  wellnessTracking: false,
} as const;

export type FeatureName = keyof typeof features;

export function isFeatureEnabled(name: FeatureName): boolean {
  return features[name];
}
