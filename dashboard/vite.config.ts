import { defineConfig, loadEnv } from 'vite'
import type { ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The browser talks to /proxy/a and /proxy/b. This dev server forwards those to
// the two backends and adds each domain's admin key on the way, so the keys
// stay in dashboard/.env.local and are never shipped in the browser bundle.
function domainProxy(port: string, adminKey: string | undefined): ProxyOptions {
  return {
    target: `http://127.0.0.1:${port}`,
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/proxy\/[ab]/, ''),
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq) => {
        if (adminKey) proxyReq.setHeader('X-Admin-Key', adminKey)
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (!env.ADMIN_KEY_A || !env.ADMIN_KEY_B) {
    console.warn(
      '\n[dashboard] ADMIN_KEY_A / ADMIN_KEY_B missing in dashboard/.env.local. ' +
        'Admin pages will show 401 errors.\n',
    )
  }
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        '/proxy/a': domainProxy(env.DOMAIN_A_PORT || '9001', env.ADMIN_KEY_A),
        '/proxy/b': domainProxy(env.DOMAIN_B_PORT || '9002', env.ADMIN_KEY_B),
      },
    },
  }
})
