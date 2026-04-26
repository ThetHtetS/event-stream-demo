/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#08111f",
        ocean: "#10213b",
        sun: "#f97316",
        mist: "#9db3d1",
        mint: "#34d399"
      },
      fontFamily: {
        display: ["'Space Grotesk'", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["'Manrope'", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      boxShadow: {
        panel: "0 24px 80px rgba(8, 17, 31, 0.28)"
      },
      backgroundImage: {
        "hero-glow":
          "radial-gradient(circle at top left, rgba(249, 115, 22, 0.26), transparent 30%), radial-gradient(circle at right center, rgba(52, 211, 153, 0.14), transparent 28%)"
      }
    }
  },
  plugins: []
};
