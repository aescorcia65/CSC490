/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Outfit", "sans-serif"],
        display: ["DM Serif Display", "serif"],
      },
      colors: {
        accent: "#6366f1",
      },
      borderRadius: {
        "4xl": "2rem",
      },
    },
  },
  plugins: [],
};