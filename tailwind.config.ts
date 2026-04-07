import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },
      borderRadius: {
        "2xl": "1rem",
        xl: "0.875rem",
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.375rem",
      },
        boxShadow: {
          'ios': '0 0 0 1px hsl(var(--border) / 0.4), 0 1px 2px 0 hsl(222 16% 8% / 0.04), 0 4px 12px -2px hsl(222 16% 8% / 0.07), 0 10px 24px -6px hsl(222 16% 8% / 0.05)',
          'ios-lg': '0 0 0 1px hsl(var(--border) / 0.3), 0 4px 8px -2px hsl(222 16% 8% / 0.08), 0 16px 32px -8px hsl(222 16% 8% / 0.12), 0 24px 48px -10px hsl(222 16% 8% / 0.08)',
          'ios-xl': '0 0 0 1px hsl(var(--border) / 0.25), 0 8px 20px -4px hsl(222 16% 8% / 0.1), 0 24px 48px -12px hsl(222 16% 8% / 0.15), 0 40px 80px -16px hsl(222 16% 8% / 0.1)',
          'premium': 'inset 0 1px 0 0 rgba(255,255,255,0.2), 0 4px 16px -2px hsl(39 60% 40% / 0.3), 0 16px 36px -8px hsl(39 60% 40% / 0.18)',
          'premium-lg': 'inset 0 1px 0 0 rgba(255,255,255,0.24), 0 8px 24px -4px hsl(39 60% 40% / 0.35), 0 24px 48px -10px hsl(39 60% 40% / 0.22)',
          'glow-primary': '0 0 32px -6px hsl(39 67% 55% / 0.4)',
          'glow-accent': '0 0 32px -6px hsl(39 72% 60% / 0.35)',
        },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "shimmer": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in": "slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-in": "scale-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-up": "slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        "shimmer": "shimmer 2s infinite",
        "pulse-soft": "pulse-soft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      fontFamily: {
        sans: [
          '"Plus Jakarta Sans Variable"',
          '"Plus Jakarta Sans"',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'sans-serif',
        ],
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
