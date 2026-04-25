export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "system-ui", "-apple-system", "sans-serif"],
        display: ["Playfair Display", "Georgia", "serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        surface: {
          1: "var(--s1)",
          2: "var(--s2)",
          3: "var(--s3)",
        },
        border: {
          0: "var(--b0)",
          1: "var(--b1)",
          2: "var(--b2)",
        },
        txt: {
          1: "var(--t1)",
          2: "var(--t2)",
          3: "var(--t3)",
        },
        brand: "var(--p)",
        "brand-light": "var(--pl)",
        "brand-dim": "var(--pd)",
        teal: "var(--tl)",
        green: "var(--gr)",
        amber: "var(--am)",
        rose: "var(--ro)",
        "doc-p": "var(--doc-p)",
        "doc-pd": "var(--doc-pd)",
        "pha-p": "var(--pha-p)",
        "pha-pd": "var(--pha-pd)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
    },
  },
  plugins: [],
};
