import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

/* Serve the Vercel /api routes inside the vite dev server so notifications
   behave exactly like production (vite alone has no handler for api/ and
   returns 404, which the notification log records as "Failed"). */
const vercelApiDev = () => ({
  name: 'vercel-api-dev',
  configureServer(server) {
    const ROUTES = new Set(['send-notification', 'monthly-reminder'])
    server.middlewares.use(async (req, res, next) => {
      const url = (req.url || '').split('?')[0]
      if (!url.startsWith('/api/')) return next()
      const route = url.slice(5)
      if (!ROUTES.has(route)) return next()
      try {
        // Cache-busted dynamic import so edits to api/*.js apply immediately.
        const file = pathToFileURL(path.resolve(`api/${route}.js`)).href
        const mod = await import(`${file}?t=${Date.now()}`)

        let raw = ''
        for await (const chunk of req) raw += chunk
        try { req.body = raw ? JSON.parse(raw) : {} } catch { req.body = {} }

        // Shim the Vercel response helpers onto Node's res.
        res.status = (code) => { res.statusCode = code; return res }
        res.json = (obj) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(obj))
        }

        await mod.default(req, res)
      } catch (err) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: err?.message || 'API route crashed', results: [] }))
      }
    })
  },
})

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Surface server-side secrets (RESEND_API_KEY) from .env.local to the
  // dev API routes — they are NOT exposed to client code (no VITE_ prefix).
  const env = loadEnv(mode, process.cwd(), '')
  if (env.RESEND_API_KEY && !process.env.RESEND_API_KEY) {
    process.env.RESEND_API_KEY = env.RESEND_API_KEY
  }

  return {
    plugins: [
      react(),
      nodePolyfills({
        include: ['path', 'stream', 'util'],
        globals: {
          Buffer: true,
          global: true,
          process: true,
        },
      }),
      vercelApiDev(),
    ],
    server: {
      historyApiFallback: true,
      /* trackTicket / rateIntake live only as deployed Cloud Functions (no
         local api/*.js file), so proxy those two routes to the live functions
         in dev — otherwise a POST to /api/* 404s and the UI shows an error. */
      proxy: {
        '/api/track-ticket': {
          target: 'https://us-central1-fmac-attendance.cloudfunctions.net',
          changeOrigin: true,
          rewrite: () => '/trackTicket',
        },
        '/api/rate-intake': {
          target: 'https://us-central1-fmac-attendance.cloudfunctions.net',
          changeOrigin: true,
          rewrite: () => '/rateIntake',
        },
      },
    },
  }
})
