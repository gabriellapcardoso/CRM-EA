/** @type {import('tailwindcss').Config} */
const config = {
    content: [
        "./app/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./context/**/*.{js,ts,jsx,tsx}",
        "./features/**/*.{js,ts,jsx,tsx}",
        "./hooks/**/*.{js,ts,jsx,tsx}",
        "./lib/**/*.{js,ts,jsx,tsx}",
        "./*.{js,ts,jsx,tsx}",
    ],
    // Note: In Tailwind v4, most configuration is done in CSS with @theme
    // This file is kept for content scanning and legacy compatibility
    darkMode: 'class',
    theme: {
        extend: {
            fontFamily: {
                sans: ['SF Pro Display', 'sans-serif'],
                display: ['SF Pro Display', 'sans-serif'],
                serif: ['Cinzel', 'serif'],
            },
            colors: {
                // aaagência brand purple — kept in sync with app/globals.css @theme
                primary: {
                    50: '#f8f2fc',
                    100: '#efe3f6',
                    200: '#ddc2ec',
                    300: '#c08fdd',
                    400: '#a059cb',
                    500: '#8330b3',
                    600: '#6a1f96',
                    700: '#54007f',
                    800: '#460069',
                    900: '#350052',
                },
                // aaagência brand lime — reserved accent for the AI/assistant surface
                lime: {
                    50: '#fbfeef',
                    100: '#f5fdd9',
                    500: '#bff208',
                    700: '#6f8c00',
                },
                dark: {
                    bg: '#020617',
                    card: '#0f172a',
                    border: '#1e293b',
                    hover: '#334155',
                },
                // Semantic tokens — bridge CSS vars (globals.css) to Tailwind utilities
                // Usage: bg-surface, text-muted, bg-success, text-error-text, etc.
                surface: 'var(--color-surface)',
                'surface-bg': 'var(--color-bg)',
                muted: 'var(--color-muted)',
                success: 'var(--color-success)',
                'success-bg': 'var(--color-success-bg)',
                'success-text': 'var(--color-success-text)',
                warning: 'var(--color-warning)',
                'warning-bg': 'var(--color-warning-bg)',
                'warning-text': 'var(--color-warning-text)',
                error: 'var(--color-error)',
                'error-bg': 'var(--color-error-bg)',
                'error-text': 'var(--color-error-text)',
                info: 'var(--color-info)',
                'info-bg': 'var(--color-info-bg)',
                'info-text': 'var(--color-info-text)',
                'text-primary': 'var(--color-text-primary)',
                'text-secondary': 'var(--color-text-secondary)',
                'text-muted': 'var(--color-text-muted)',
                'text-subtle': 'var(--color-text-subtle)',
            },
            backgroundImage: {
                'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
            }
        },
    },
    plugins: [],
}

module.exports = config
