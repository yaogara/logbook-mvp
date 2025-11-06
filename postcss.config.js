/**
 * PostCSS config (ESM) so both ESM- and CJS-only plugins resolve cleanly.
 * Keeps Tailwind + Autoprefixer working across versions.
 */
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}

