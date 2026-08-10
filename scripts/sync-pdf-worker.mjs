/**
 * Copies the PDF.js worker into /public.
 *
 * The worker must be served byte-for-byte: anything resolved through the
 * bundler gets rewritten into an ES module by Vite's dev transform, which a
 * classic Worker cannot load. Serving it from /public bypasses that entirely.
 *
 * Run after changing the pdfjs-dist version:  npm run sync-pdf-worker
 */
import { copyFileSync, existsSync, readFileSync } from 'node:fs'

const SRC = 'node_modules/pdfjs-dist/build/pdf.worker.min.js'
const DEST = 'public/pdf.worker.min.js'

if (!existsSync(SRC)) {
  console.error(`✗ ${SRC} not found — run npm install first.`)
  process.exit(1)
}

copyFileSync(SRC, DEST)

const version = JSON.parse(
  readFileSync('node_modules/pdfjs-dist/package.json', 'utf8'),
).version
console.log(`✓ Synced PDF.js worker (pdfjs-dist ${version}) → ${DEST}`)
