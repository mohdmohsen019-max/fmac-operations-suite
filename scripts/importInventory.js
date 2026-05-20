import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const XLSX = require('xlsx')
const { initializeApp } = require('firebase/app')
const { initializeFirestore, collection, doc, writeBatch, getDocs, serverTimestamp } = require('firebase/firestore')

// ─── Firebase config (copied from project) ───────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyB-mUHApk_20yRJsQEKs9--VhZmXpkE3EM",
  authDomain: "fmac-attendance.firebaseapp.com",
  projectId: "fmac-attendance",
  storageBucket: "fmac-attendance.firebasestorage.app",
  messagingSenderId: "79220864890",
  appId: "1:79220864890:web:37c7b292be4cdf5e1288c3",
  measurementId: "G-V89EG3S24N"
}

const app = initializeApp(firebaseConfig)
const db = initializeFirestore(app, { experimentalForceLongPolling: true })

// ─── Category → { sport, category } mapping ──────────────────────────────────
const CAT_MAP = {
  'GI':                   { sport: 'judo',         category: 'uniforms'    },
  'KARATE':               { sport: 'karate',        category: 'uniforms'    },
  'JIU JITSU':            { sport: 'jiu_jitsu',     category: 'uniforms'    },
  'TKD':                  { sport: 'taekwondo',     category: 'uniforms'    },
  'Rashgard':             { sport: 'mma',           category: 'uniforms'    },
  'FOOT PROTECTION':      { sport: 'karate',        category: 'equipment'   },
  'GLOVES':               { sport: 'karate',        category: 'equipment'   },
  'CHEST':                { sport: 'karate',        category: 'equipment'   },
  'TKD PROTECTION LEG':   { sport: 'taekwondo',     category: 'equipment'   },
  'SENSOR LEG TKD':       { sport: 'taekwondo',     category: 'equipment'   },
  'GLOVES TKD':           { sport: 'taekwondo',     category: 'equipment'   },
  'MALE GROWIN GARD':     { sport: 'taekwondo',     category: 'equipment'   },
  'FEMALE GROWIN GARD':   { sport: 'taekwondo',     category: 'equipment'   },
  'ARM PROTECTOR TKD':    { sport: 'taekwondo',     category: 'equipment'   },
  'LEG PROTECTOR TKD':    { sport: 'taekwondo',     category: 'equipment'   },
  'HEAD GARD BOXING':     { sport: 'boxing',        category: 'equipment'   },
  'BOXING GLOVES':        { sport: 'boxing',        category: 'equipment'   },
  'HAND WRAP':            { sport: 'boxing',        category: 'equipment'   },
  'BOXING SHOES':         { sport: 'boxing',        category: 'equipment'   },
  'PUNCHING BAG':         { sport: 'boxing',        category: 'equipment'   },
  'Mouth guard':          { sport: 'boxing',        category: 'equipment'   },
  'CHEST PROTECTOR TKD':  { sport: 'taekwondo',     category: 'equipment'   },
  'DOUBLE TARGET':        { sport: 'taekwondo',     category: 'equipment'   },
  'TARGET':               { sport: 'taekwondo',     category: 'equipment'   },
  'HEAD GARD TKD':        { sport: 'taekwondo',     category: 'equipment'   },
  'BXING BALL':           { sport: 'boxing',        category: 'equipment'   },
  'BELT':                 { sport: 'taekwondo',     category: 'equipment'   },
  'JODU BELT':            { sport: 'judo',          category: 'equipment'   },
  'USB':                  { sport: 'general',       category: 'merchandise' },
  'BERMUDA':              { sport: 'general',       category: 'uniforms'    },
  'HOODY':                { sport: 'general',       category: 'uniforms'    },
  'JACKET':               { sport: 'general',       category: 'uniforms'    },
  'JACKET MACRON':        { sport: 'general',       category: 'uniforms'    },
  'MASK':                 { sport: 'general',       category: 'merchandise' },
  'SHOES':                { sport: 'general',       category: 'uniforms'    },
  'T SHIRT':              { sport: 'general',       category: 'uniforms'    },
  'T SHIRT FMAC':         { sport: 'general',       category: 'uniforms'    },
  'T SHIRT SUMMER':       { sport: 'general',       category: 'uniforms'    },
  'TSHIRT MACRON':        { sport: 'general',       category: 'uniforms'    },
  'PANTS':                { sport: 'general',       category: 'uniforms'    },
  'PANT MACRON':          { sport: 'general',       category: 'uniforms'    },
  'PANT SUMMER':          { sport: 'general',       category: 'uniforms'    },
  'OLD T SHIRT ADIDAS':   { sport: 'general',       category: 'uniforms'    },
  'OLD PANTS ADIDAS':     { sport: 'general',       category: 'uniforms'    },
  'OLD JACKET ADIDAS':    { sport: 'general',       category: 'uniforms'    },
  'LUGGAGE BAG ADIDAS':   { sport: 'general',       category: 'merchandise' },
  'VEST':                 { sport: 'general',       category: 'uniforms'    },
  'DRIVER T SHIRT':       { sport: 'general',       category: 'uniforms'    },
  'DRIVER PANT':          { sport: 'general',       category: 'uniforms'    },
  'BAG':                  { sport: 'general',       category: 'merchandise' },
  'BACKPACK':             { sport: 'general',       category: 'merchandise' },
  'BOTTLE':               { sport: 'general',       category: 'merchandise' },
  'SOCKS':                { sport: 'general',       category: 'uniforms'    },
  'TOYS':                 { sport: 'general',       category: 'merchandise' },
  'PRINTER':              { sport: 'general',       category: 'other'       },
  'MONITOR':              { sport: 'general',       category: 'other'       },
  'ACESSORIES':           { sport: 'general',       category: 'other'       },
  'SPONGE ARCHERY':       { sport: 'general',       category: 'equipment'   },
  'MATRES':               { sport: 'judo',          category: 'equipment'   },
  'HIGH JUMB':            { sport: 'general',       category: 'equipment'   },
  'GENERAL':              { sport: 'general',       category: 'other'       },
  'FENCING':              { sport: 'fencing',       category: 'equipment'   },
  'COMPETITION':          { sport: 'general',       category: 'equipment'   },
  'SKIPPING ROPE':        { sport: 'general',       category: 'equipment'   },
}

// ─── Category → English base name for generated nameEn ───────────────────────
const CAT_EN_NAME = {
  'GI': 'Judo Gi', 'KARATE': 'Karate Gi', 'JIU JITSU': 'Jiu Jitsu Gi',
  'TKD': 'Taekwondo Dobok', 'Rashgard': 'Rashguard',
  'FOOT PROTECTION': 'Foot Protection', 'GLOVES': 'Karate Gloves',
  'CHEST': 'Chest Protector', 'TKD PROTECTION LEG': 'TKD Leg Protection',
  'SENSOR LEG TKD': 'TKD Leg Sensor', 'GLOVES TKD': 'TKD Gloves',
  'MALE GROWIN GARD': 'Male Groin Guard', 'FEMALE GROWIN GARD': 'Female Groin Guard',
  'ARM PROTECTOR TKD': 'TKD Arm Protector', 'LEG PROTECTOR TKD': 'TKD Leg Protector',
  'HEAD GARD BOXING': 'Boxing Head Guard', 'BOXING GLOVES': 'Boxing Gloves',
  'HAND WRAP': 'Hand Wrap', 'BOXING SHOES': 'Boxing Shoes',
  'PUNCHING BAG': 'Punching Bag', 'Mouth guard': 'Mouth Guard',
  'CHEST PROTECTOR TKD': 'TKD Chest Protector', 'DOUBLE TARGET': 'Double Target',
  'TARGET': 'Target Pad', 'HEAD GARD TKD': 'TKD Head Guard',
  'BXING BALL': 'Boxing Ball', 'BELT': 'Belt', 'JODU BELT': 'Judo Belt',
  'USB': 'USB Drive', 'BERMUDA': 'Bermuda Shorts', 'HOODY': 'Hoodie',
  'JACKET': 'Jacket', 'JACKET MACRON': 'Macron Jacket', 'MASK': 'Mask',
  'SHOES': 'Shoes', 'T SHIRT': 'T-Shirt', 'T SHIRT FMAC': 'FMAC T-Shirt',
  'T SHIRT SUMMER': 'Summer T-Shirt', 'TSHIRT MACRON': 'Macron T-Shirt',
  'PANTS': 'Pants', 'PANT MACRON': 'Macron Pants', 'PANT SUMMER': 'Summer Pants',
  'OLD T SHIRT ADIDAS': 'Adidas T-Shirt (Old)', 'OLD PANTS ADIDAS': 'Adidas Pants (Old)',
  'OLD JACKET ADIDAS': 'Adidas Jacket (Old)', 'LUGGAGE BAG ADIDAS': 'Adidas Luggage Bag',
  'VEST': 'Vest', 'DRIVER T SHIRT': 'Driver T-Shirt', 'DRIVER PANT': 'Driver Pants',
  'BAG': 'Bag', 'BACKPACK': 'Backpack', 'BOTTLE': 'Water Bottle',
  'SOCKS': 'Socks', 'TOYS': 'Toys', 'PRINTER': 'Printer', 'MONITOR': 'Monitor',
  'ACESSORIES': 'Accessories', 'SPONGE ARCHERY': 'Archery Sponge',
  'MATRES': 'Mat', 'HIGH JUMB': 'High Jump Equipment',
  'GENERAL': 'General Item', 'FENCING': 'Fencing Equipment',
  'COMPETITION': 'Competition Equipment', 'SKIPPING ROPE': 'Skipping Rope',
}

// ─── Size extraction ──────────────────────────────────────────────────────────
const LETTER_SIZE_PATTERNS = [
  { re: /\bXXXXS\b|4XS/,               size: 'XXXXS' },
  { re: /\bXXXS\b|3XS/,                size: 'XXXS'  },
  { re: /\bXXS\b|2XS/,                 size: 'XXS'   },
  { re: /XSMALL|X[\s-]*SMALL|\bXS\b/,  size: 'XS'    },
  { re: /\b4XL\b/,                      size: '4XL'   },
  { re: /\b3XL\b/,                      size: '3XL'   },
  { re: /\b2XL\b|\bXXL\b/,             size: 'XXL'   },
  { re: /\bXL\b/,                       size: 'XL'    },
  { re: /\bLARGE\b|\bL\b/,             size: 'L'     },
  { re: /\bMEDIUM\b|\bM\b/,            size: 'M'     },
  { re: /\bSMALL\b|\bS\b/,             size: 'S'     },
]

// Clothing sizes (multiples of 10, 100–300) — checked as whole numbers
const CLOTHING_SIZES = [300, 280, 260, 240, 220, 210, 200, 190, 185, 180, 175, 170, 160, 155, 150, 140, 130, 120, 110, 100]

function extractSize(nameAr, sku) {
  const text = `${nameAr || ''} ${sku || ''}`.toUpperCase()

  for (const { re, size } of LETTER_SIZE_PATTERNS) {
    if (re.test(text)) return size
  }

  for (const s of CLOTHING_SIZES) {
    if (new RegExp(`\\b${s}\\b`).test(text)) return String(s)
  }

  for (let shoe = 45; shoe >= 37; shoe--) {
    if (new RegExp(`\\b${shoe}\\b`).test(text)) return String(shoe)
  }

  return null
}

// ─── English name generation ──────────────────────────────────────────────────
function buildNameEn(category, size) {
  const base = CAT_EN_NAME[category] || (category ? category.charAt(0) + category.slice(1).toLowerCase() : 'Item')
  return size ? `${base} ${size}` : base
}

// ─── Barcode extraction ───────────────────────────────────────────────────────
function extractBarcode(code, sku) {
  if (code !== null && code !== undefined) {
    if (typeof code === 'number') return String(Math.floor(code))  // numeric → string
    if (typeof code === 'string' && code.trim() !== '') {
      // Text/notes → fall through to use SKU
    }
  }
  // null, NaN, or text → use SKU; if no SKU → null
  return sku ? String(sku) : null
}

// ─── Main import function ─────────────────────────────────────────────────────
async function main() {
  const force = process.argv.includes('--force')

  // Safety check
  const existing = await getDocs(collection(db, 'inventory_items'))
  if (!existing.empty) {
    console.error(`\nERROR: inventory_items already has ${existing.size} documents.`)
    console.error('Use --force to override and re-import.\n')
    if (!force) process.exit(1)
    console.log('--force detected, continuing…\n')
  }

  // Read Excel
  const wb = XLSX.readFile('C:/Users/mohdm/Desktop/جرد_المخازن_مع_الاكواد_المعبأة.xlsx')
  const rawData = XLSX.utils.sheet_to_json(wb.Sheets['Sheet1'], { defval: null })
  console.log(`Read ${rawData.length} rows from Sheet1\n`)

  const skipped = []
  const docs = []

  for (const row of rawData) {
    const nameAr = typeof row.Product === 'string' ? row.Product.trim() : (row.Product ? String(row.Product).trim() : null)
    const sku    = row.SKU ? String(row.SKU).trim() : null

    // Skip rows where both SKU and Product are empty
    if (!nameAr && !sku) {
      skipped.push({ reason: 'empty SKU and Product', row })
      continue
    }

    const category = row.Category || null
    const mapped   = CAT_MAP[category] || { sport: 'general', category: 'other' }
    if (!CAT_MAP[category]) {
      skipped.push({ reason: `unmapped category: "${category}"`, Product: nameAr, SKU: sku })
    }

    const size         = extractSize(nameAr, sku)
    const currentStock = (row['Opening Stock'] != null && !isNaN(Number(row['Opening Stock'])))
      ? Math.max(0, Math.floor(Number(row['Opening Stock'])))
      : 0
    const barcode      = extractBarcode(row.Code, sku)
    const nameEn       = buildNameEn(category, size)

    docs.push({
      nameAr:       nameAr || '',
      nameEn,
      sku:          sku,
      barcode,
      category:     mapped.category,
      sport:        mapped.sport,
      size,
      currentStock,
      minThreshold: 5,
      unit:         'piece',
      unitAr:       'قطعة',
      supplierId:   null,
      notes:        null,
      isActive:     true,
      createdAt:    serverTimestamp(),
      updatedAt:    serverTimestamp(),
      createdBy:    'system_import',
    })
  }

  console.log(`Prepared ${docs.length} documents to import (${skipped.length} skipped)\n`)

  // Write in batches of 400
  const BATCH_SIZE = 400
  let totalImported = 0

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const chunk = docs.slice(i, i + BATCH_SIZE)
    const batch = writeBatch(db)
    chunk.forEach(d => batch.set(doc(collection(db, 'inventory_items')), d))
    await batch.commit()
    totalImported += chunk.length
    console.log(`Committed batch: ${totalImported}/${docs.length} documents imported`)
  }

  // ─── Summary ────────────────────────────────────────────────────────────────
  const bySport    = {}
  const byCat      = {}
  let withBarcode  = 0
  let noSKU        = 0
  let outOfStock   = 0

  for (const d of docs) {
    bySport[d.sport]    = (bySport[d.sport]    || 0) + 1
    byCat[d.category]   = (byCat[d.category]   || 0) + 1
    if (d.barcode && d.barcode !== d.sku) withBarcode++
    if (!d.sku) noSKU++
    if (d.currentStock === 0) outOfStock++
  }

  console.log('\n✅ Import complete')
  console.log(`Total imported: ${totalImported}`)
  console.log('\nBy sport:')
  Object.entries(bySport).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k}: ${v}`))
  console.log('\nBy category:')
  Object.entries(byCat).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k}: ${v}`))
  console.log(`\nItems with numeric barcode: ${withBarcode}`)
  console.log(`Items without SKU: ${noSKU}`)
  console.log(`Out of stock items (currentStock = 0): ${outOfStock}`)

  if (skipped.length > 0) {
    console.log(`\nSkipped rows (${skipped.length}):`)
    skipped.forEach(s => console.log(' ', JSON.stringify(s)))
  }

  process.exit(0)
}

main().catch(err => {
  console.error('Import failed:', err)
  process.exit(1)
})
