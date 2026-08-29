/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
  	extend: {
  		fontFamily: {
  			// Schibsted Grotesk covers Latin + Latin-ext. When rendered text
  			// contains a codepoint outside those ranges, browsers fall through
  			// to the next family that has a matching glyph — the Noto Sans
  			// script variants (loaded via src/index.css @fontsource-variable
  			// imports) each cover their script's codepoints with a small
  			// unicode-range chunk. English users never download them; Chinese
  			// (SC/TC), Japanese, Korean, Devanagari (Hindi), Bengali, Thai,
  			// Arabic (ar/fa/ur), Hebrew, and Tamil users pull only the chunks
  			// their rendered text needs. Mono stack unchanged because
  			// verifiable values are ASCII-only (addresses / hashes / amounts).
  			sans: [
  				'"Schibsted Grotesk"',
  				'"Noto Sans SC Variable"', '"Noto Sans TC Variable"',
  				'"Noto Sans JP Variable"', '"Noto Sans KR Variable"',
  				'"Noto Sans Devanagari Variable"', '"Noto Sans Bengali Variable"',
  				'"Noto Sans Thai Variable"', '"Noto Sans Arabic Variable"',
  				'"Noto Sans Hebrew Variable"', '"Noto Sans Tamil Variable"',
  				'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'
  			],
  			mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace']
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
  			caution: {
  				DEFAULT: 'hsl(var(--caution))',
  				foreground: 'hsl(var(--caution-foreground))'
  			},
  			risk: {
  				DEFAULT: 'hsl(var(--risk))',
  				foreground: 'hsl(var(--risk-foreground))'
  			},
  			info: {
  				DEFAULT: 'hsl(var(--info))',
  				foreground: 'hsl(var(--info-foreground))'
  			},
  			success: {
  				DEFAULT: 'hsl(var(--success))',
  				foreground: 'hsl(var(--success-foreground))'
  			},
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			'onboarding-indeterminate': {
  				'0%': { transform: 'translateX(-100%)' },
  				'100%': { transform: 'translateX(300%)' }
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'onboarding-indeterminate': 'onboarding-indeterminate 1.2s ease-in-out infinite'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}