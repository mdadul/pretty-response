/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/viewer/**/*.{ts,tsx,html}",
    "./src/styles/**/*.css"
  ],
  theme: {
    extend: {
      colors: {
        dracula: {
          bg: "#282a36",
          fg: "#f8f8f2"
        },
        solarized: {
          lightBg: "#fdf6e3",
          lightFg: "#657b83",
          darkBg: "#002b36",
          darkFg: "#93a1a1"
        },
        nord: {
          bg: "#2e3440",
          fg: "#d8dee9"
        }
      }
    }
  },
  plugins: []
};

