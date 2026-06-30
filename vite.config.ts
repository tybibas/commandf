import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Standalone Command F app. Builds index.html -> src/standalone/main.tsx.
//
// The three values below are public by design (the Supabase anon key and URL
// are meant to ship in the browser bundle, and the Command F backend URL is a
// public endpoint). They are injected via `define` with safe fallbacks so the
// app builds with zero config. Override any of them by creating a `.env` file
// with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_MODAL_COMMANDF_URL.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
        env.VITE_SUPABASE_URL || 'https://rvlldohkdrzduccqhdkr.supabase.co'
      ),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(
        env.VITE_SUPABASE_ANON_KEY ||
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2bGxkb2hrZHJ6ZHVjY3FoZGtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MDM2MjEsImV4cCI6MjA2ODk3OTYyMX0.NGgeDQ3QW_Xq1C-4_Uj-97IO626kMcT-NJ-en34e570'
      ),
      'import.meta.env.VITE_MODAL_COMMANDF_URL': JSON.stringify(
        env.VITE_MODAL_COMMANDF_URL || 'https://tybibas10--commandf-fastapi-app.modal.run'
      ),
    },
  };
});
