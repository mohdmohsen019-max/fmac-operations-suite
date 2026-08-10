/* ══════════════════════════════════════════════════════════════════════════
   Help Desk — strategic report data engine
   تقرير تجربة المتعامل الاستراتيجي

   Everything here is computed from the live `requests` collection: no stored
   report figures, no hard-coded results. Where a measurement genuinely has no
   data yet (e.g. satisfaction before any follow-up call is logged) the builder
   returns null so the document can show "قيد الجمع" rather than invent a number.
   ════════════════════════════════════════════════════════════════════════ */

import {
  SLA_HOURS, SLA_DEFAULT_HOURS, slaHoursFor, TYPE_LABEL,
  resolutionMinutesOf, slaMetOf, avgResolutionMinutes, slaCompliancePct,
  avgCsat, csatSatisfiedPct,
} from './helpConfig'

const toMs = (t) => {
  if (!t) return 0
  const d = t?.toDate ? t.toDate() : new Date(t)
  const ms = d.getTime()
  return Number.isNaN(ms) ? 0 : ms
}
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null)

export const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

/* Arabic number agreement — a formal document must not read "5 طلباً".
   1 → طلب · 2 → طلبان · 3–10 → طلبات · 11+ → طلباً */
export const nReq = (n) => {
  const c = Number(n) || 0
  if (c === 1) return 'طلب واحد'
  if (c === 2) return 'طلبان'
  if (c >= 3 && c <= 10) return `${c} طلبات`
  return `${c} طلباً`
}

/* Document reference — mirrors the assets register format. */
export const docRef = (prefix = 'CX') => {
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `FMAC-OPS-${prefix}-${stamp}`
}

/* ── Domain lexicon: maps real complaint/suggestion language to service themes.
   Built from the club's actual request vocabulary (transport, coaching,
   conduct, facilities…). A request may match more than one theme. ── */
export const THEMES = [
  { key: 'transport',  ar: 'النقل والحافلات',        en: 'Transport & buses',      kw: ['باص', 'الباص', 'حافلة', 'الحافلة', 'باصات', 'السائق', 'سائق', 'النقل', 'توصيل', 'مواصلات'] },
  { key: 'coaching',   ar: 'المدربون والتدريب',       en: 'Coaching & training',    kw: ['مدرب', 'المدرب', 'المدربين', 'مدربين', 'كابتن', 'الكابتن', 'تدريب', 'التدريب', 'حصة', 'الحصص', 'تمرين', 'التمارين'] },
  { key: 'conduct',    ar: 'السلوك والانضباط',        en: 'Conduct & discipline',   kw: ['مضايقة', 'سباب', 'تنمر', 'شجار', 'احترام', 'الاحترام', 'تعدي', 'إساءة', 'اساءة', 'ضرب', 'عنف', 'استهتار', 'مستهتر'] },
  { key: 'facilities', ar: 'المرافق والنظافة',        en: 'Facilities & cleanliness', kw: ['نظافة', 'النظافة', 'الصالة', 'صالة', 'حمام', 'الحمام', 'مرفق', 'المرافق', 'مكيف', 'التكييف', 'إضاءة', 'المبنى'] },
  { key: 'equipment',  ar: 'المعدات والزي الرياضي',    en: 'Equipment & kit',        kw: ['أدوات', 'الادوات', 'الأدوات', 'معدات', 'المعدات', 'بدلة', 'الزي الرياضي', 'البس', 'لبس', 'ملابس', 'حزام'] },
  { key: 'fees',       ar: 'الرسوم والاشتراكات',       en: 'Fees & subscriptions',   kw: ['رسوم', 'الرسوم', 'اشتراك', 'الاشتراك', 'دفع', 'مبلغ', 'فاتورة', 'سداد', 'مالي'] },
  { key: 'comms',      ar: 'التواصل والاستجابة',       en: 'Communication & response', kw: ['تواصل', 'التواصل', 'الرد', 'ردود', 'استفسار', 'معلومات', 'إبلاغ', 'ابلاغ', 'تجاهل', 'اتصال'] },
  { key: 'events',     ar: 'البطولات والمعسكرات',      en: 'Tournaments & camps',    kw: ['بطولة', 'البطولة', 'بطولات', 'معسكر', 'المعسكر', 'مسابقة', 'مشاركة', 'المشاركة'] },
  { key: 'admin',      ar: 'التسجيل والإجراءات',       en: 'Registration & process', kw: ['تسجيل', 'التسجيل', 'قبول', 'انتساب', 'عضوية', 'إجراءات', 'اجراءات', 'استمارة'] },
  { key: 'scheduling', ar: 'المواعيد والجدولة',        en: 'Scheduling & timing',    kw: ['موعد', 'المواعيد', 'توقيت', 'التوقيت', 'جدول', 'الجدول', 'تأخير', 'تاخير', 'وقت'] },
]

const themesOf = (text) => {
  const s = String(text || '')
  if (!s.trim()) return []
  return THEMES.filter(th => th.kw.some(k => s.includes(k))).map(th => th.key)
}

/* ═══════════════════════ main builder ═══════════════════════ */
export function buildCxReport(requests = []) {
  const all = requests.filter(Boolean)
  const closed = all.filter(r => r.status === 'closed')
  const total = all.length

  /* ── headline KPIs ── */
  const avgRes = avgResolutionMinutes(all)
  const compliance = slaCompliancePct(all)
  const csat = avgCsat(all)
  const csatSat = csatSatisfiedPct(all)
  const withSatisfaction = all.filter(r => r.satisfaction?.rating != null).length
  const withResolution = all.filter(r => resolutionMinutesOf(r) != null).length

  const years = all.map(r => new Date(toMs(r.createdAt)).getFullYear()).filter(y => y && !Number.isNaN(y))
  const firstYear = years.length ? Math.min(...years) : null
  const lastYear = years.length ? Math.max(...years) : null

  /* ── by service type (SLA compliance mechanism) ── */
  const typeKeys = [...new Set(all.map(r => r.type).filter(Boolean))]
  const byType = typeKeys.map(type => {
    const rows = all.filter(r => r.type === type)
    const resolved = rows.filter(r => resolutionMinutesOf(r) != null)
    const within = rows.filter(r => slaMetOf(r) === true).length
    return {
      type,
      ar: TYPE_LABEL[type]?.ar || type,
      en: TYPE_LABEL[type]?.en || type,
      count: rows.length,
      sharePct: pct(rows.length, total) ?? 0,
      targetH: slaHoursFor(type),
      avgRes: avgResolutionMinutes(rows),
      resolvedCount: resolved.length,
      within,
      compliance: resolved.length ? pct(within, resolved.length) : null,
    }
  }).sort((a, b) => b.count - a.count)

  /* ── by branch ── */
  const branchKeys = [...new Set(all.map(r => r.userInfo?.branch).filter(Boolean))]
  const byBranch = branchKeys.map(b => {
    const rows = all.filter(r => r.userInfo?.branch === b)
    return { branch: b, count: rows.length, sharePct: pct(rows.length, total) ?? 0, avgRes: avgResolutionMinutes(rows) }
  }).sort((a, b) => b.count - a.count)

  /* ── demand trend by year (the running year is flagged as partial so it is
     never compared like-for-like against a completed year) ── */
  const currentYear = new Date().getFullYear()
  const yearKeys = [...new Set(years)].sort()
  const byYear = yearKeys.map(y => {
    const rows = all.filter(r => new Date(toMs(r.createdAt)).getFullYear() === y)
    return {
      year: y, count: rows.length,
      avgRes: avgResolutionMinutes(rows), compliance: slaCompliancePct(rows),
      partial: y === currentYear,
    }
  })

  /* ── seasonality by month ── */
  const byMonth = MONTHS_AR.map((ar, i) => ({
    month: i + 1, ar,
    count: all.filter(r => new Date(toMs(r.createdAt)).getMonth() === i).length,
  }))
  const peakMonths = [...byMonth].sort((a, b) => b.count - a.count).filter(m => m.count > 0).slice(0, 3)

  /* ── theme analysis (احتياجات وتوقعات المتعاملين) ── */
  const descriptions = all.map(r => r.content?.description || '')
  const distinctDescriptions = new Set(descriptions.map(s => s.trim()).filter(Boolean)).size
  const themeCounts = Object.fromEntries(THEMES.map(t => [t.key, 0]))
  let unmatched = 0
  all.forEach(r => {
    const keys = themesOf(r.content?.description)
    if (keys.length === 0) { unmatched++; return }
    keys.forEach(k => { themeCounts[k] += 1 })
  })
  const themes = THEMES
    .map(t => ({ key: t.key, ar: t.ar, en: t.en, count: themeCounts[t.key], sharePct: pct(themeCounts[t.key], total) ?? 0 }))
    .filter(t => t.count > 0)
    .sort((a, b) => b.count - a.count)
  const themeCoverage = pct(total - unmatched, total)

  /* ── computed insights ── */
  const insights = []
  if (themes.length) {
    insights.push(`تصدّر موضوع «${themes[0].ar}» قائمة اهتمامات المتعاملين بواقع ${nReq(themes[0].count)} (${themes[0].sharePct}% من الإجمالي)، ما يجعله أولوية التحسين الأولى.`)
  }
  if (avgRes != null) {
    const topType = byType[0]
    if (topType?.targetH) {
      const targetMin = topType.targetH * 60
      const faster = Math.round(((targetMin - avgRes) / targetMin) * 100)
      insights.push(faster > 0
        ? `بلغ متوسط زمن الإنجاز ${(avgRes / 60).toFixed(1)} ساعة، أي أسرع من المستهدف المعتمد لفئة «${topType.ar}» (${topType.targetH} ساعة) بنسبة ${faster}%.`
        : `بلغ متوسط زمن الإنجاز ${(avgRes / 60).toFixed(1)} ساعة مقابل مستهدف ${topType.targetH} ساعة لفئة «${topType.ar}»، ما يستدعي مراجعة آلية الاستجابة.`)
    }
  }
  if (compliance != null) {
    insights.push(`بلغت نسبة الالتزام بمستويات الخدمة ${compliance}% عبر ${nReq(withResolution)} مقيساً، وهي ${compliance >= 90 ? 'نسبة متقدّمة تعكس نضج آلية الاستجابة' : 'نسبة تتطلب تعزيزاً في فئات محددة'}.`)
  }
  /* Year-on-year is only stated between two COMPLETED years; a running year is
     reported as partial instead of being presented as a decline. */
  const completedYears = byYear.filter(y => !y.partial)
  if (completedYears.length >= 2) {
    const a = completedYears[completedYears.length - 2], b = completedYears[completedYears.length - 1]
    const delta = a.count ? Math.round(((b.count - a.count) / a.count) * 100) : null
    if (delta != null) {
      insights.push(`تغيّر حجم الطلبات من ${nReq(a.count)} في ${a.year} إلى ${nReq(b.count)} في ${b.year} (${delta >= 0 ? '+' : ''}${delta}%)، ${delta >= 0 ? 'ما يعكس ارتفاع ثقة المتعاملين في قنوات التواصل الرسمية واتساع استخدامها' : 'ما قد يعكس انخفاض مسببات الشكوى نتيجة التحسينات المطبّقة'}.`)
    }
  }
  const partialYear = byYear.find(y => y.partial)
  if (partialYear) {
    insights.push(`بيانات عام ${partialYear.year} جزئية حتى تاريخ إصدار التقرير (${nReq(partialYear.count)})، ولا تُقارن مباشرةً بالأعوام المكتملة.`)
  }
  if (peakMonths.length) {
    insights.push(`تتركّز ذروة الطلبات في أشهر ${peakMonths.map(m => m.ar).join('، ')} — ما يستدعي تعزيز الجاهزية والتغطية خلال هذه الفترات.`)
  }
  if (csat == null) {
    insights.push('لم تُسجَّل بعد أي قراءات لرضا المتعاملين؛ تم تفعيل آلية القياس عبر مكالمة المتابعة وستتوفّر النتائج تِباعاً مع إغلاق الطلبات الجديدة.')
  } else {
    insights.push(`بلغ متوسط رضا المتعاملين ${csat} من ٥، بنسبة رضا ${csatSat}% عبر ${withSatisfaction} تقييماً مسجّلاً.`)
  }

  /* ── improvement opportunities (تحسين وإعادة تصميم الخدمة) ── */
  const improvements = []
  themes.slice(0, 3).forEach(t => {
    improvements.push({
      themeAr: t.ar,
      volume: t.count,
      actionAr: IMPROVEMENT_ACTIONS[t.key] || 'مراجعة إجراءات الخدمة المرتبطة وتحديد نقاط التحسين مع الإدارة المعنية.',
    })
  })
  const weakType = byType.filter(x => x.compliance != null).sort((a, b) => a.compliance - b.compliance)[0]
  if (weakType && weakType.compliance < 100) {
    improvements.push({
      themeAr: `مستوى الخدمة — ${weakType.ar}`,
      volume: weakType.count,
      actionAr: `رفع نسبة الالتزام لفئة «${weakType.ar}» (${weakType.compliance}%) عبر مراجعة مسار المعالجة وتوزيع الأحمال على الفريق.`,
    })
  }
  if (withSatisfaction === 0) {
    improvements.push({
      themeAr: 'قياس تجربة المتعامل',
      volume: closed.length,
      actionAr: 'تسجيل تقييم الرضا لكل طلب مُغلق عبر مكالمة المتابعة، لبناء سلسلة قياس تجربة المتعامل واعتمادها كدليل أداء.',
    })
  }

  /* ── recommendations ── */
  const recommendations = []
  if (themes.length) recommendations.push(`إطلاق مبادرة تحسين مُركّزة على «${themes[0].ar}» باعتباره الموضوع الأعلى تكراراً، مع مؤشر قياس لأثر التحسين خلال دورتين.`)
  recommendations.push('الاستمرار في قياس زمن الإنجاز لكل طلب واعتماده مؤشراً رسمياً ضمن بطاقة أداء إدارة العمليات.')
  if (withSatisfaction === 0) recommendations.push('تفعيل تسجيل رضا المتعامل لكل طلب مُغلق لاستكمال منظومة قياس تجربة المتعامل.')
  recommendations.push('مراجعة مستويات الخدمة المعتمدة سنوياً ومواءمتها مع حجم الطلب الفعلي وقدرات الفريق.')
  recommendations.push('توثيق التحسينات الناتجة عن الشكاوى والمقترحات وإعلانها للمتعاملين لتعزيز الثقة وإغلاق دائرة التغذية الراجعة.')

  return {
    kpi: {
      total, closed: closed.length, closedPct: pct(closed.length, total) ?? 0,
      avgResolution: avgRes, slaCompliance: compliance,
      csat, csatSatisfied: csatSat, withSatisfaction, withResolution,
      satisfactionCoverage: pct(withSatisfaction, closed.length),
      firstYear, lastYear, branches: byBranch.length, types: byType.length,
    },
    byType, byBranch, byYear, byMonth, peakMonths,
    themes, themeCoverage, unmatched,
    improvements, insights, recommendations,
    slaTable: Object.entries(SLA_HOURS).map(([type, h]) => ({
      type, ar: TYPE_LABEL[type]?.ar || type, en: TYPE_LABEL[type]?.en || type, targetH: h,
      used: typeKeys.includes(type),
    })),
    quality: {
      total, withResolution, withSatisfaction, distinctDescriptions,
      satisfactionPct: pct(withSatisfaction, closed.length) ?? 0,
      resolutionPct: pct(withResolution, total) ?? 0,
      themeCoverage,
      defaultSla: SLA_DEFAULT_HOURS,
    },
  }
}

const IMPROVEMENT_ACTIONS = {
  transport: 'مراجعة خطة النقل: توزيع المشرفين على الحافلات، وتحديد مسؤول لكل مسار، وتفعيل قناة إبلاغ فورية لأولياء الأمور.',
  coaching: 'اعتماد معايير سلوك ومظهر للمدربين، وبرنامج تقييم دوري، وآلية تغذية راجعة من أولياء الأمور بعد كل دورة تدريبية.',
  conduct: 'تطبيق ميثاق سلوك للاعبين داخل المرافق وفي الحافلات، مع إجراءات تصعيد واضحة وتوثيق كل واقعة.',
  facilities: 'جدولة نظافة وصيانة دورية موثّقة للمرافق، مع قائمة تحقق يومية ومسؤول معتمد لكل موقع.',
  equipment: 'مراجعة توفر الزي والمعدات ضمن سجل المخزون، وربط نواقص الأصناف بإعادة الطلب التلقائي.',
  fees: 'توضيح جدول الرسوم وقنوات السداد في الموقع الإلكتروني، وإصدار إيصال آلي لكل عملية.',
  comms: 'اعتماد زمن رد معياري لكل قناة، وإشعار المتعامل تلقائياً عند استلام طلبه وعند إغلاقه.',
  events: 'نشر روزنامة البطولات والمعسكرات مسبقاً، وتأكيد المشاركة والنقل قبل الموعد بوقت كافٍ.',
  admin: 'تبسيط إجراءات التسجيل وتقليل الحقول المطلوبة، مع دليل إرشادي مصوّر للمتعاملين.',
  scheduling: 'مراجعة جداول الحصص ومواعيد النقل، والإعلان المسبق عن أي تعديل عبر القنوات الرسمية.',
}
