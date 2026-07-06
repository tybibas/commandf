/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        /* ── W0.2 Semantic tokens ─────────────────────────────────────────
           NOTE on naming: Tailwind prepends the utility (bg-/text-/border-).
           Canonical CLASS forms are bg-bg-primary, text-text-primary,
           border-border-light — i.e. the KEY carries the semantic prefix
           once ('bg-primary', 'border-light'), never twice. */
        'text-primary':   'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-muted':     'var(--color-text-muted)',

        'structure':       'var(--color-structure)',
        'structure-ink':   'var(--color-structure-ink)',
        'structure-hover': 'var(--color-structure-hover)',
        'accent':        'var(--color-accent)',
        'accent-ink':    'var(--color-accent-ink)',
        'accent-soft':   'var(--color-accent-soft)',

        'source':      'var(--color-source)',
        'source-soft': 'var(--color-source-soft)',
        'verified':    'var(--color-verified)',

        'hairline': 'var(--color-hairline)',

        'focus-ring': 'var(--color-focus-ring)',

        /* Deck Studio (DESIGN.md §3) — class forms bg-studio-canvas / bg-studio-slide */
        'studio-canvas': 'var(--color-studio-canvas)',
        'studio-slide':  'var(--color-studio-slide)',

        /* Surfaces — canonical keys; class form is bg-bg-primary etc. */
        'bg-primary':   'var(--color-bg-primary)',
        'bg-secondary': 'var(--color-bg-secondary)',
        'bg-tertiary':  'var(--color-bg-tertiary)',
        'bg-elevated':  'var(--color-bg-elevated)',

        /* Borders — canonical keys; class form is border-border-light etc. */
        'border':        'var(--color-border)',
        'border-light':  'var(--color-border-light)',
        'border-hover':  'var(--color-border-hover)',
        'border-strong': 'var(--color-border-strong)',

        /* Feedback */
        'success':      'var(--color-success)',
        'warning':      'var(--color-warning)',
        'error':        'var(--color-error)',
        'info':         'var(--color-info)',
        'success-soft': 'var(--color-success-soft)',
        'warning-soft': 'var(--color-warning-soft)',
        'error-soft':   'var(--color-error-soft)',
        'info-soft':    'var(--color-info-soft)',
        'warning-fg':   'var(--color-warning-fg)',

        /* Intent */
        'intent-high':         'var(--color-intent-high)',
        'intent-medium':       'var(--color-intent-medium)',
        'intent-low':          'var(--color-intent-low)',
        'intent-high-soft':    'var(--color-intent-high-soft)',
        'intent-medium-soft':  'var(--color-intent-medium-soft)',
        'intent-low-soft':     'var(--color-intent-low-soft)',
      },
      /* ── W0.3 Type scale (DESIGN.md §1 table) ──────────────────────── */
      fontSize: {
        'micro':   ['12px', { lineHeight: '16px', letterSpacing: '0.01em' }],
        'caption': ['13px', { lineHeight: '18px', letterSpacing: '0' }],
        'body-sm': ['14px', { lineHeight: '20px', letterSpacing: '0' }],
        'body':    ['16px', { lineHeight: '24px', letterSpacing: '0' }],
        'base':    ['16px', { lineHeight: '24px', letterSpacing: '0' }],
        'lg':      ['18px', { lineHeight: '26px', letterSpacing: '-0.01em' }],
        'xl':      ['24px', { lineHeight: '32px', letterSpacing: '-0.015em' }],
        '2xl':     ['32px', { lineHeight: '40px', letterSpacing: '-0.02em' }],
        'display': ['40px', { lineHeight: '48px', letterSpacing: '-0.025em' }],
      },
      /* ── W0.1 Font families ─────────────────────────────────────────── */
      fontFamily: {
        /* New canonical families */
        'display': ['DM Sans', '"TWK Lausanne"', 'system-ui', 'sans-serif'],
        'body':    ['"IBM Plex Sans"', '-apple-system', 'system-ui', 'sans-serif'],
        'mono':    ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      spacing: {
        '4.5': '1.125rem',
        '18':  '4.5rem',
      },
      borderRadius: {
        'sm':      '4px',
        'DEFAULT': '8px',
        'lg':      '12px',
        'full':    '9999px',
        'control': 'var(--radius-control)',
        'surface': 'var(--radius-surface)',
        /* W0.4 new */
        'card':    'var(--radius-card)',
        'image':   'var(--radius-image)',
        'pill':    'var(--radius-pill)',
      },
      maxWidth: {
        'content':     'var(--content-width-max)',
        'prose-tight': 'var(--content-width-prose)',
      },
      boxShadow: {
        /* W0.4 — shadow-dark-* and shadow-gold* removed; components remapped to shadow-float */
        'float':       'var(--elevation-float)',
        'float-hover': 'var(--elevation-float-hover)',
        /* Legacy card shadows kept for non-commandf surfaces */
        'dark':    '0 2px 8px 0 rgba(0, 0, 0, 0.4)',
        'dark-lg': '0 10px 25px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.3)',
      },
      transitionDuration: {
        'fast': 'var(--motion-duration-fast)',
        'base': 'var(--motion-duration-base)',
        'slow': 'var(--motion-duration-slow)',
      },
      transitionTimingFunction: {
        'out-soft':   'var(--motion-ease-spring)',
        'out-expo':   'var(--motion-ease-out)',
        'out-spring': 'var(--motion-ease-spring)',
      },
      animation: {
        'slide-up': 'slide-up 0.4s ease-out',
        'fade-in':  'fade-in 0.3s ease-out',
        'shimmer':  'shimmer 2s infinite linear',
      },
    },
  },
  plugins: [],
};
