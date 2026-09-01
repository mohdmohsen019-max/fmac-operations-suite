import * as pdfjsLib from 'pdfjs-dist'

if (typeof window !== 'undefined') pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'

const MODEL_RULES = [
  { terms: ['تويوتا كوستر'], make: 'Toyota', model: 'Coaster', vehicleType: 'Bus' },
  { terms: ['تويوتا هايس', 'تويوتا هاي اس'], make: 'Toyota', model: 'Hiace', vehicleType: 'Van' },
  { terms: ['تويوتا انوفا', 'تويوتا إنوفا'], make: 'Toyota', model: 'Innova', vehicleType: 'Station wagon' },
  { terms: ['تويوتا كامري'], make: 'Toyota', model: 'Camry', vehicleType: 'Sedan' },
  { terms: ['نيسان اكس تريل', 'نيسان إكس تريل'], make: 'Nissan', model: 'X-Trail', vehicleType: 'SUV' },
  { terms: ['نيسان ماكسيما'], make: 'Nissan', model: 'Maxima', vehicleType: 'Sedan' },
  { terms: ['نيسان التيما', 'نيسان ألتيما'], make: 'Nissan', model: 'Altima', vehicleType: 'Sedan' },
  { terms: ['فورد اف 150', 'فورد إف 150'], make: 'Ford', model: 'F-150', vehicleType: 'Crew cab pickup' },
]

const toIsoDate = (value) => {
  const match = String(value || '').match(/^(\d{2})-(\d{2})-(\d{4})$/)
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null
}

const searchableArabic = (value) => {
  const normalized = String(value || '').normalize('NFKC')
    .replace(/[یى]/g, 'ي')
    .replace(/ک/g, 'ك')
    .replace(/ھ/g, 'ه')
    .replace(/\s+/g, ' ')
  return `${normalized}\n${[...normalized].reverse().join('')}`
}

export const parseVehicleRegistrationText = (rawText, expectedRegistration = '') => {
  const lines = String(rawText || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const text = lines.join('\n')
  const plateNumber = text.match(/(?:^|\s)\/\s*(\d{3,6})(?:\s|$)/)?.[1] || null
  const expectedDigits = String(expectedRegistration || '').replace(/\D/g, '')
  if (expectedDigits && plateNumber && expectedDigits !== plateNumber) {
    throw new Error(`This card belongs to plate ${plateNumber}, not ${expectedRegistration}.`)
  }

  const dates = [...text.matchAll(/\b\d{2}-\d{2}-\d{4}\b/g)].map((match) => match[0])
  const chassisNumber = text.match(/\b[A-HJ-NPR-Z0-9]{17}\b/i)?.[0]?.toUpperCase() || null
  const yearPassengers = text.match(/(?<!-)\b((?:19|20)\d{2})\s+(\d{1,2})\b(?!-)/)
  const longNumbers = lines.flatMap((line) => line.match(/\b\d{9,12}\b/g) || [])
  const arabic = searchableArabic(text)
  const model = MODEL_RULES.find((rule) => rule.terms.some((term) => arabic.includes(term.normalize('NFKC'))))

  const result = {
    plateNumber,
    chassisNumber,
    registrationExpiry: toIsoDate(dates[0]),
    registrationDate: toIsoDate(dates[1]),
    insuranceExpiry: toIsoDate(dates[2]),
    year: yearPassengers ? Number(yearPassengers[1]) : null,
    passengers: yearPassengers ? Number(yearPassengers[2]) : null,
    trafficCodeNumber: longNumbers[0] || null,
    policyNumber: longNumbers.find((number) => number.length >= 11) || longNumbers[1] || null,
    make: model?.make || null,
    model: model?.model || null,
    vehicleType: model?.vehicleType || null,
  }

  const required = ['plateNumber', 'chassisNumber', 'registrationExpiry', 'insuranceExpiry', 'year', 'passengers']
  const missing = required.filter((field) => !result[field])
  if (missing.length) throw new Error(`The card could not be read completely (${missing.join(', ')}).`)
  return result
}

export const parseVehicleRegistrationCard = async (file, expectedRegistration = '') => {
  if (!file || !/\.pdf$/i.test(file.name || '')) throw new Error('Registration cards must be uploaded as PDF files.')
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await pdfjsLib.getDocument({ data }).promise
  if (pdf.numPages !== 1) throw new Error('Upload the one-page vehicle registration card PDF.')
  const page = await pdf.getPage(1)
  const content = await page.getTextContent()
  const strings = content.items.map((item) => item.str)
  const text = `${strings.join(' ')}\n${strings.join('')}`
  if (!text.trim()) throw new Error('No readable registration data was found in this PDF.')
  return parseVehicleRegistrationText(text, expectedRegistration)
}
