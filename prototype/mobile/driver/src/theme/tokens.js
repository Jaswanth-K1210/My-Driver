/**
 * MyDriver design tokens.
 *
 * The system is strictly red + white + neutral. Red is the only chromatic
 * colour in the app. Danger is distinguished from a primary action by
 * treatment, not hue: primary actions are solid red fills, danger states are
 * red-tinted surfaces with a warning icon, and "safe / clean" reads as
 * graphite with a check rather than green.
 */

export const colors = {
  // Brand
  red: '#E01E26',
  redPressed: '#B0161C',
  redDeep: '#8A1015',
  redSoft: '#FDECEC',
  redSofter: '#FEF6F6',
  onRed: '#FFFFFF',

  // Neutrals
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F6F6F8',
  surfaceSunken: '#F0F0F3',
  border: '#E5E5EA',
  borderStrong: '#D0D0D8',

  // The "safe / verified" signal — deliberately achromatic
  graphite: '#16161C',

  text: '#0C0C10',
  textMuted: '#62626E',
  // Contrast 2.99:1 — decorative and large text only, never for information
  // a user needs to read.
  textFaint: '#8A8A96',

  onGraphite: '#FFFFFF',
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
}

/** Short alias used by the product screens. */
export const space = spacing

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
}

export const font = {
  sizes: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    hero: 28,
  },
  weights: {
    medium: '500',
    semibold: '600',
    bold: '800',
  },
}

export const type = {
  // React Native has no font-weight shorthand story across platforms, so we
  // keep sizes and weights together and let screens spread them.
  micro: { fontSize: 10, fontWeight: '700' },
  tiny: { fontSize: 11, fontWeight: '600' },
  caption: { fontSize: 12, fontWeight: '600' },
  body: { fontSize: 14, fontWeight: '600' },
  bodyBold: { fontSize: 14, fontWeight: '800' },
  title: { fontSize: 16, fontWeight: '800' },
  headline: { fontSize: 19, fontWeight: '900' },
  display: { fontSize: 28, fontWeight: '900' },
}

export const shadow = {
  card: {
    shadowColor: '#0C0C10',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#0C0C10',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
}
