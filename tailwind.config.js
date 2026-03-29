/** @type {import('tailwindcss').Config} */
export default {
  content: ["./*.tsx", "./*.ts"],
  theme: {
    extend: {
      colors: {
        "atmos-cyan":  "#00c8e8",
        "atmos-green": "#00e070",
        "atmos-bg":    "#080c10",
      },
      animation: {
        progress: "progress 20s linear forwards",
      },
      keyframes: {
        progress: { from: { width: "0%" }, to: { width: "100%" } },
      },
    },
  },
  plugins: [],
};
