/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: 'oklch(var(--color-background) / <alpha-value>)',
        foreground: 'oklch(var(--color-foreground) / <alpha-value>)',
        card: 'oklch(var(--color-card) / <alpha-value>)',
        primary: 'oklch(var(--color-primary) / <alpha-value>)',
        'primary-dark': 'oklch(var(--color-primary-dark) / <alpha-value>)',
        secondary: 'oklch(var(--color-secondary) / <alpha-value>)',
        accent: 'oklch(var(--color-accent) / <alpha-value>)',
        muted: 'oklch(var(--color-muted) / <alpha-value>)',
        'muted-foreground': 'oklch(var(--color-muted-foreground) / <alpha-value>)',
        border: 'oklch(var(--color-border) / <alpha-value>)',
        input: 'oklch(var(--color-input) / <alpha-value>)',
        ring: 'oklch(var(--color-ring) / <alpha-value>)',
        error: 'oklch(var(--color-error) / <alpha-value>)',
        warning: 'oklch(var(--color-warning) / <alpha-value>)',
        success: 'oklch(var(--color-success) / <alpha-value>)',
      },
    },
  },
  plugins: [],
}
