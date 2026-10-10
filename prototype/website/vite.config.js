import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * One codebase, two sites. VITE_APP_TARGET picks the root component at build
 * time, so each bundle contains only its own pages:
 *   customer (default) -> the public website and customer dashboard
 *   admin              -> the operations console, for its own subdomain
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_APP_TARGET || process.env.VITE_APP_TARGET || 'customer'
  if (!['customer', 'admin'].includes(target)) throw new Error(`Unknown VITE_APP_TARGET "${target}"`)
  const admin = target === 'admin'

  return {
    plugins: [
      react(),
      {
        name: 'mydriver-target-html',
        transformIndexHtml: (html) =>
          admin
            ? html
                .replace(/<title>.*<\/title>/, '<title>MyDriver · Operations console</title>')
                .replace(/<meta name="description"[^>]*>/, '<meta name="robots" content="noindex, nofollow" />')
            : html,
      },
    ],
    resolve: {
      alias: {
        '@root': fileURLToPath(new URL(admin ? './src/AdminApp.jsx' : './src/CustomerApp.jsx', import.meta.url)),
      },
    },
    // Separate output folders, so building one never overwrites the other.
    build: { outDir: admin ? 'dist-admin' : 'dist' },
    server: { port: admin ? 5174 : 5173 },
  }
})
