const ARABIC_MAP = {
  '\u0621': ['\uFE80'], // Hamza
  '\u0622': ['\uFE81', '\uFE81', '\uFE82', '\uFE82'], // Alif Madda
  '\u0623': ['\uFE83', '\uFE83', '\uFE84', '\uFE84'], // Alif Hamza Above
  '\u0624': ['\uFE85', '\uFE85', '\uFE86', '\uFE86'], // Waw Hamza
  '\u0625': ['\uFE87', '\uFE87', '\uFE88', '\uFE88'], // Alif Hamza Below
  '\u0626': ['\uFE89', '\uFE8B', '\uFE8C', '\uFE8A'], // Yeh Hamza
  '\u0627': ['\uFE8D', '\uFE8D', '\uFE8E', '\uFE8E'], // Alif
  '\u0628': ['\uFE8F', '\uFE91', '\uFE92', '\uFE90'], // Ba
  '\u0629': ['\uFE93', '\uFE93', '\uFE94', '\uFE94'], // Teh Marbuta
  '\u062A': ['\uFE95', '\uFE97', '\uFE98', '\uFE96'], // Ta
  '\u062B': ['\uFE99', '\uFE9B', '\uFE9C', '\uFE9A'], // Tha
  '\u062C': ['\uFE9D', '\uFE9F', '\uFEA0', '\uFE9E'], // Jeem
  '\u062D': ['\uFEA1', '\uFEA3', '\uFEA4', '\uFEA2'], // Haa
  '\u062E': ['\uFEA5', '\uFEA7', '\uFEA8', '\uFEA6'], // Khaa
  '\u062F': ['\uFEA9', '\uFEA9', '\uFEAA', '\uFEAA'], // Dal
  '\u0630': ['\uFEAB', '\uFEAB', '\uFEAC', '\uFEAC'], // Thal
  '\u0631': ['\uFEAD', '\uFEAD', '\uFEAE', '\uFEAE'], // Ra
  '\u0632': ['\uFEAF', '\uFEAF', '\uFEB0', '\uFEB0'], // Zain
  '\u0633': ['\uFEB1', '\uFEB3', '\uFEB4', '\uFEB2'], // Seen
  '\u0634': ['\uFEB5', '\uFEB7', '\uFEB8', '\uFEB6'], // Sheen
  '\u0635': ['\uFEB9', '\uFEBB', '\uFEBC', '\uFEBA'], // Sad
  '\u0636': ['\uFEBD', '\uFEBF', '\uFEC0', '\uFEBE'], // Dad
  '\u0637': ['\uFEC1', '\uFEC3', '\uFEC4', '\uFEC2'], // Tah
  '\u0638': ['\uFEC5', '\uFEC7', '\uFEC8', '\uFEC6'], // Zah
  '\u0639': ['\uFEC9', '\uFECB', '\uFECC', '\uFECA'], // Ain
  '\u063A': ['\uFECD', '\uFECF', '\uFED0', '\uFECE'], // Ghain
  '\u0641': ['\uFED1', '\uFED3', '\uFED4', '\uFED2'], // Fa
  '\u0642': ['\uFED5', '\uFED7', '\uFED8', '\uFED6'], // Qaf
  '\u0643': ['\uFED9', '\uFEDB', '\uFEDC', '\uFEDA'], // Kaf
  '\u0644': ['\uFEDD', '\uFEDF', '\uFEE0', '\uFEDE'], // Lam
  '\u0645': ['\uFEE1', '\uFEE3', '\uFEE4', '\uFEE2'], // Meem
  '\u0646': ['\uFEE5', '\uFEE7', '\uFEE8', '\uFEE6'], // Noon
  '\u0647': ['\uFEE9', '\uFEEB', '\uFEEC', '\uFEEA'], // Heh
  '\u0648': ['\uFEED', '\uFEED', '\uFEEE', '\uFEEE'], // Waw
  '\u0649': ['\uFEEF', '\uFEEF', '\uFEF0', '\uFEF0'], // Alef Maksura
  '\u064A': ['\uFEF1', '\uFEF3', '\uFEF4', '\uFEF2'], // Yeh
  // Persian / Urdu
  '\u067E': ['\uFB56', '\uFB58', '\uFB59', '\uFB57'], // Pe
  '\u0686': ['\uFB7A', '\uFB7C', '\uFB7D', '\uFB7B'], // Che
  '\u0698': ['\uFB8A', '\uFB8A', '\uFB8B', '\uFB8B'], // Zhe
  '\u06AF': ['\uFB92', '\uFB94', '\uFB95', '\uFB93'], // Gaf
}

const NON_JOIN_LEFT = new Set([
  '\u0621', '\u0622', '\u0623', '\u0624', '\u0625', '\u0627', '\u062F', '\u0630', '\u0631', '\u0632', '\u0648', '\u0649', '\u0629', '\u0698'
])

const isDiacritic = (c) => c >= '\u064B' && c <= '\u065F'
const isPresentationForm = (c) => (c >= '\uFB50' && c <= '\uFDFF') || (c >= '\uFE70' && c <= '\uFEFF')

export function reshapeArabic(text) {
  if (!text || typeof text !== 'string') return text
  
  // ── Protection: If already reshaped, do not process again ──
  if (/[\uFB50-\uFEFF]/.test(text)) return text

  return text.split(/(\s+)/).map(part => {
    if (!/[\u0600-\u06FF]/.test(part)) return part

    const chars = Array.from(part)
    let reshaped = []

    for (let i = 0; i < chars.length; i++) {
      const char = chars[i]
      if (isDiacritic(char)) {
        reshaped.push(char)
        continue
      }

      // Find real previous and next characters (skipping diacritics)
      let prev = null
      for (let j = i - 1; j >= 0; j--) {
        if (!isDiacritic(chars[j])) { prev = chars[j]; break }
      }
      let next = null
      for (let j = i + 1; j < chars.length; j++) {
        if (!isDiacritic(chars[j])) { next = chars[j]; break }
      }

      // ── Ligatures (Lam-Alif) ──
      if (char === '\u0644' && next && '\u0622\u0623\u0625\u0627'.includes(next)) {
        let lig = []
        if (next === '\u0622')      lig = ['\uFEF5', '\uFEF5', '\uFEF6', '\uFEF6']
        else if (next === '\u0623') lig = ['\uFEF7', '\uFEF7', '\uFEF8', '\uFEF8']
        else if (next === '\u0625') lig = ['\uFEF9', '\uFEF9', '\uFEFA', '\uFEFA']
        else if (next === '\u0627') lig = ['\uFEFB', '\uFEFB', '\uFEFC', '\uFEFC']

        const canJoinPrev = prev && (ARABIC_MAP[prev] || isPresentationForm(prev)) && !NON_JOIN_LEFT.has(prev)
        reshaped.push(canJoinPrev ? lig[2] : lig[0])
        
        while (i + 1 < chars.length && isDiacritic(chars[i + 1])) {
          i++; reshaped.push(chars[i])
        }
        i++ 
        continue
      }

      const map = ARABIC_MAP[char]
      if (!map) {
        reshaped.push(char)
        continue
      }

      const canJoinPrev = prev && (ARABIC_MAP[prev] || isPresentationForm(prev)) && !NON_JOIN_LEFT.has(prev)
      const canJoinNext = next && (ARABIC_MAP[next] || isPresentationForm(next))

      if (canJoinPrev && canJoinNext && map[2])      reshaped.push(map[2])
      else if (canJoinPrev && map[3])                reshaped.push(map[3])
      else if (canJoinNext && !NON_JOIN_LEFT.has(char) && map[1]) reshaped.push(map[1])
      else                                          reshaped.push(map[0])
    }

    return reshaped.join('')
  }).join('')
}
