import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        parchment: {
          bg: "#fbf6ec",
          card: "#f4ede0",
          text: "#2c241d",
          border: "#e6dcce",
          accent: "#8b5e3c",
        },
        eyecare: {
          bg: "#dcead9",
          card: "#d0dfcd",
          text: "#1f3323",
          border: "#c3d3c0",
          accent: "#2e613b",
        },
        darktheme: {
          bg: "#121214",
          card: "#1b1b1f",
          text: "#dcdce0",
          border: "#2a2a30",
          accent: "#60a5fa",
        },
      },
    },
  },
  plugins: [],
};

export default config;
