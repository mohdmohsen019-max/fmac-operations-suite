/**
 * fuelReportExport — exportable monthly fuel analytics reports.
 *
 *   exportFuelExcel(payload) — xlsx workbook, three Arabic sheets:
 *     ملخص الشهر · مقارنة المركبات · الاتجاه الشهري
 *   exportFuelPdf(payload)   — A4 Arabic RTL PDF in the suite's print language:
 *     white page, ink headings, hairline rules, crimson accents only.
 *
 * Payload (built by FuelDashboard):
 *   { month, year, fleet, vehicles, decomposition, insights, trend, currency }
 */
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CairoRegularBase64, CairoBoldBase64 } from '../../../utils/cairoFont';

/* ── Print palette — LITERAL colors only (suite print language) ─────────── */
const INK = [20, 20, 25];      // #141419 — headings & body
const MUTED = [122, 122, 130]; // #7a7a82 — secondary text
const HAIRLINE = [228, 225, 218]; // #e4e1da — rules & table lines
const CRIMSON = [199, 0, 23];  // #c70017 — small accent marks ONLY
const PAPER_ALT = [248, 247, 244]; // #f8f7f4 — subtle alternating rows

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const VERDICT_AR = { improving: 'تحسّن', worsening: 'تراجع', stable: 'مستقر' };

const round = (v, d = 2) => (v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 10 ** d) / 10 ** d);
const cell = (v, d = 2) => (round(v, d) == null ? '—' : round(v, d));
const pctCell = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${round(v, 1)}%`);

/* ── Excel ──────────────────────────────────────────────────────────────── */

export function exportFuelExcel({ month, year, fleet, vehicles = [], decomposition, trend = [] }) {
  const wb = XLSX.utils.book_new();
  const cur = fleet?.current || {};
  const prev = fleet?.previous || null;
  const deltas = fleet?.deltas || {};

  /* Sheet 1 — ملخص الشهر: fleet KPIs + deltas */
  const monthLabel = `${ARABIC_MONTHS[month - 1]} ${year}`;
  const metricRow = (label, key, d = 2) => [
    label,
    cell(cur[key], d),
    prev ? cell(prev[key], d) : '—',
    deltas[key]?.abs == null ? '—' : round(deltas[key].abs, d),
    pctCell(deltas[key]?.pct),
  ];
  const summary = [
    ['تقرير أداء الوقود الشهري'],
    ['الشهر', monthLabel],
    ['تاريخ الإنشاء', new Date().toLocaleDateString('en-GB')],
    [],
    ['المؤشر', 'الشهر الحالي', 'الشهر السابق', 'التغير', 'التغير %'],
    metricRow('إجمالي التكلفة (د.إ)', 'totalCost', 0),
    metricRow('إجمالي اللترات', 'totalLitres', 0),
    metricRow('إجمالي المسافة (كم)', 'totalKm', 0),
    metricRow('التكلفة / كم (د.إ)', 'costPerKm'),
    metricRow('الاستهلاك (لتر/100كم)', 'litresPer100km', 1),
    metricRow('سعر اللتر (د.إ)', 'pricePerLitre'),
  ];
  if (decomposition && decomposition.priceEffect != null) {
    summary.push(
      [],
      ['تحليل التغير في إجمالي التكلفة'],
      ['إجمالي التغير (د.إ)', round(decomposition.totalDelta, 0)],
      ['أثر تغيّر سعر اللتر (د.إ)', round(decomposition.priceEffect, 0)],
      ['أثر تغيّر الاستهلاك (د.إ)', round(decomposition.volumeEffect, 0)],
    );
  }
  const ws1 = XLSX.utils.aoa_to_sheet(summary);
  ws1['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'ملخص الشهر');

  /* Sheet 2 — مقارنة المركبات: per-vehicle table */
  const vehRows = [
    ['المركبة', 'المسافة (كم)', 'اللترات', 'الاستهلاك (لتر/100كم)', 'التكلفة (د.إ)', 'التكلفة/كم (د.إ)', 'التغير % (لتر/100كم)', 'الحكم'],
    ...vehicles.map((v) => [
      v.plate,
      cell(v.km, 0),
      cell(v.litres, 1),
      cell(v.litresPer100km, 1),
      cell(v.cost, 0),
      cell(v.costPerKm, 2),
      pctCell(v.deltaL100?.pct),
      v.verdict ? VERDICT_AR[v.verdict] : '—',
    ]),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(vehRows);
  ws2['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'مقارنة المركبات');

  /* Sheet 3 — الاتجاه الشهري: per-month history */
  const trendRows = [
    ['السنة', 'الشهر', 'إجمالي التكلفة (د.إ)', 'إجمالي اللترات', 'سعر اللتر (د.إ)'],
    ...trend.map((s) => [
      s.year,
      ARABIC_MONTHS[s.month - 1] || s.month,
      cell(s.totalCost, 0),
      cell(s.totalLitres, 0),
      s.pricePerLitre != null && Number(s.pricePerLitre) > 0
        ? round(s.pricePerLitre, 2)
        : cell(Number(s.totalLitres) > 0 ? Number(s.totalCost) / Number(s.totalLitres) : null, 2),
    ]),
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(trendRows);
  ws3['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'الاتجاه الشهري');

  XLSX.writeFile(wb, `fuel-analytics-${year}-${String(month).padStart(2, '0')}.xlsx`);
}

/* ── Arabic reshaping (same joined-forms approach as reportExportService) ── */
const ARABIC_MAP = {
  'ا': ['ﺍ', 'ﺍ', 'ﺎ', 'ﺎ'], // Alif
  'ب': ['ﺏ', 'ﺑ', 'ﺒ', 'ﺐ'], // Ba
  'ت': ['ﺕ', 'ﺗ', 'ﺘ', 'ﺖ'], // Ta
  'ث': ['ﺙ', 'ﺛ', 'ﺜ', 'ﺚ'], // Tha
  'ج': ['ﺝ', 'ﺟ', 'ﺠ', 'ﺞ'], // Jeem
  'ح': ['ﺡ', 'ﺣ', 'ﺤ', 'ﺢ'], // Haa
  'خ': ['ﺥ', 'ﺧ', 'ﺨ', 'ﺦ'], // Khaa
  'د': ['ﺩ', 'ﺩ', 'ﺪ', 'ﺪ'], // Dal
  'ذ': ['ﺫ', 'ﺫ', 'ﺬ', 'ﺬ'], // Thal
  'ر': ['ﺭ', 'ﺭ', 'ﺮ', 'ﺮ'], // Ra
  'ز': ['ﺯ', 'ﺯ', 'ﺰ', 'ﺰ'], // Zain
  'س': ['ﺱ', 'ﺳ', 'ﺴ', 'ﺲ'], // Seen
  'ش': ['ﺵ', 'ﺷ', 'ﺸ', 'ﺶ'], // Sheen
  'ص': ['ﺹ', 'ﺻ', 'ﺼ', 'ﺺ'], // Sad
  'ض': ['ﺽ', 'ﺿ', 'ﻀ', 'ﺾ'], // Dad
  'ط': ['ﻁ', 'ﻃ', 'ﻄ', 'ﻂ'], // Tah
  'ظ': ['ﻅ', 'ﻇ', 'ﻈ', 'ﻆ'], // Zah
  'ع': ['ﻉ', 'ﻋ', 'ﻌ', 'ﻊ'], // Ain
  'غ': ['ﻍ', 'ﻏ', 'ﻐ', 'ﻎ'], // Ghain
  'ف': ['ﻑ', 'ﻓ', 'ﻔ', 'ﻒ'], // Fa
  'ق': ['ﻕ', 'ﻗ', 'ﻘ', 'ﻖ'], // Qaf
  'ك': ['ﻙ', 'ﻛ', 'ﻜ', 'ﻚ'], // Kaf
  'ل': ['ﻝ', 'ﻟ', 'ﻠ', 'ﻞ'], // Lam
  'م': ['ﻡ', 'ﻣ', 'ﻤ', 'ﻢ'], // Meem
  'ن': ['ﻥ', 'ﻧ', 'ﻨ', 'ﻦ'], // Noon
  'ه': ['ﻩ', 'ﻫ', 'ﻬ', 'ﻪ'], // Heh
  'و': ['ﻭ', 'ﻭ', 'ﻮ', 'ﻮ'], // Waw
  'ي': ['ﻱ', 'ﻳ', 'ﻴ', 'ﻲ'], // Yeh
  'ئ': ['ﺉ', 'ﺋ', 'ﺌ', 'ﺊ'], // Yeh Hamza
  'ى': ['ﻯ', 'ﻯ', 'ﻰ', 'ﻰ'], // Alef Maksura
  'ة': ['ﺓ', 'ﺓ', 'ﺔ', 'ﺔ'], // Teh Marbuta
  'آ': ['ﺁ', 'ﺁ', 'ﺂ', 'ﺂ'], // Alif Madda
  'أ': ['ﺃ', 'ﺃ', 'ﺄ', 'ﺄ'], // Alif Hamza Above
  'إ': ['ﺇ', 'ﺇ', 'ﺈ', 'ﺈ'], // Alif Hamza Below
  'ؤ': ['ﺅ', 'ﺅ', 'ﺆ', 'ﺆ'], // Waw Hamza
};
const NON_JOIN_RIGHT = new Set([
  'ا', 'د', 'ذ', 'ر', 'ز', 'و', 'آ', 'أ', 'إ', 'ؤ',
  'ﺍ', 'ﺎ', 'ﺩ', 'ﺪ', 'ﺫ', 'ﺬ', 'ﺭ', 'ﺮ', 'ﺯ', 'ﺰ', 'ﻭ', 'ﻮ',
]);

function reshape(text) {
  if (!text) return '';
  const chars = Array.from(String(text));
  let result = '';
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const map = ARABIC_MAP[char];
    if (!map) { result += char; continue; }
    const prev = chars[i - 1];
    const next = chars[i + 1];
    const canJoinPrev = prev && ARABIC_MAP[prev] && !NON_JOIN_RIGHT.has(prev);
    const canJoinNext = next && ARABIC_MAP[next];
    if (canJoinPrev && canJoinNext) result += map[2];
    else if (canJoinPrev) result += map[3];
    else if (canJoinNext) result += map[1];
    else result += map[0];
  }
  return result;
}

/* ── PDF ────────────────────────────────────────────────────────────────── */

export function exportFuelPdf({ month, year, fleet, vehicles = [], decomposition, insights = [] }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', putOnlyUsedFonts: true });

  doc.addFileToVFS('Cairo-Regular.ttf', CairoRegularBase64);
  doc.addFont('Cairo-Regular.ttf', 'Cairo', 'normal');
  doc.addFileToVFS('Cairo-Bold.ttf', CairoBoldBase64);
  doc.addFont('Cairo-Bold.ttf', 'Cairo', 'bold');
  doc.setFont('Cairo', 'normal');
  doc.setR2L(true);

  const W = doc.internal.pageSize.getWidth();   // 210
  const H = doc.internal.pageSize.getHeight();  // 297
  const M = 18;                                 // page margin
  const startX = W - M;                         // RTL anchor
  const contentW = W - M * 2;

  const monthAr = `${ARABIC_MONTHS[month - 1]} ${year}`;
  const now = new Date();
  const todayAr = `${now.getDate()} ${ARABIC_MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  const hairline = (y, x1 = M, x2 = W - M, w = 0.3) => {
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(w);
    doc.line(x1, y, x2, y);
  };

  /* ── Title block ── */
  let y = 24;
  // Small crimson mark beside the title — the page's only strong accent.
  doc.setFillColor(...CRIMSON);
  doc.rect(startX, y - 6.5, 1.4, 9, 'F');
  doc.setFont('Cairo', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...INK);
  doc.text(reshape('تقرير أداء الوقود الشهري'), startX - 4, y, { align: 'right' });

  y += 9;
  doc.setFont('Cairo', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(...MUTED);
  doc.text(reshape(`أسطول العمليات — ${monthAr}`), startX - 4, y, { align: 'right' });

  // Generated date, bottom-left of title block
  doc.setFontSize(8.5);
  doc.text(reshape(`تاريخ الإنشاء: ${todayAr}`), M, y, { align: 'left' });

  y += 6;
  hairline(y, M, W - M, 0.5);
  y += 10;

  /* ── KPI summary band ── */
  const cur = fleet?.current || {};
  const deltas = fleet?.deltas || {};
  const hasPrev = !!fleet?.previous;
  const fmtV = (v, d = 1) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d }));
  const kpis = [
    { label: 'إجمالي التكلفة (د.إ)', value: fmtV(cur.totalCost, 0), pct: deltas.totalCost?.pct, lowerIsBetter: true },
    { label: 'إجمالي اللترات', value: fmtV(cur.totalLitres, 0), pct: deltas.totalLitres?.pct, lowerIsBetter: true },
    { label: 'إجمالي المسافة (كم)', value: fmtV(cur.totalKm, 0), pct: deltas.totalKm?.pct, lowerIsBetter: null },
    { label: 'التكلفة / كم (د.إ)', value: fmtV(cur.costPerKm, 2), pct: deltas.costPerKm?.pct, lowerIsBetter: true },
    { label: 'الاستهلاك (لتر/100كم)', value: fmtV(cur.litresPer100km, 1), pct: deltas.litresPer100km?.pct, lowerIsBetter: true },
    { label: 'سعر اللتر (د.إ)', value: fmtV(cur.pricePerLitre, 2), pct: deltas.pricePerLitre?.pct, lowerIsBetter: true },
  ];

  const cols = 3;
  const gap = 4;
  const boxW = (contentW - gap * (cols - 1)) / cols;
  const boxH = 22;
  kpis.forEach((kpi, i) => {
    const col = i % cols;
    const rowIdx = Math.floor(i / cols);
    // RTL order: first KPI in the rightmost column.
    const x = W - M - boxW - col * (boxW + gap);
    const by = y + rowIdx * (boxH + gap);

    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.3);
    doc.rect(x, by, boxW, boxH, 'S');

    doc.setFont('Cairo', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(reshape(kpi.label), x + boxW - 4, by + 6.5, { align: 'right' });

    doc.setFont('Cairo', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...INK);
    doc.text(String(kpi.value), x + boxW - 4, by + 14.5, { align: 'right' });

    if (hasPrev && kpi.pct != null) {
      const worse = kpi.lowerIsBetter === true && kpi.pct > 0;
      doc.setFont('Cairo', 'normal');
      doc.setFontSize(7.5);
      // Crimson only as a small mark on adverse movement; otherwise muted ink.
      if (worse) doc.setTextColor(...CRIMSON);
      else doc.setTextColor(...MUTED);
      const arrow = kpi.pct > 0 ? '+' : '';
      doc.text(reshape(`${arrow}${fmtV(kpi.pct, 1)}% مقابل الشهر السابق`), x + boxW - 4, by + 19.5, { align: 'right' });
    }
  });
  y += Math.ceil(kpis.length / cols) * (boxH + gap) + 4;

  /* ── Cost decomposition line ── */
  if (decomposition && decomposition.priceEffect != null) {
    const sgn = (v) => `${v > 0 ? '+' : ''}${fmtV(v, 0)}`;
    doc.setFont('Cairo', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(
      reshape(
        `تحليل التغير: ${sgn(decomposition.totalDelta)} د.إ إجمالاً — ${sgn(decomposition.priceEffect)} د.إ أثر تغيّر السعر، ${sgn(decomposition.volumeEffect)} د.إ أثر تغيّر الاستهلاك.`,
      ),
      startX, y + 2, { align: 'right' },
    );
    y += 8;
  }

  hairline(y);
  y += 8;

  /* ── Per-vehicle table ── */
  doc.setFont('Cairo', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  doc.setFillColor(...CRIMSON);
  doc.rect(startX, y - 3.6, 1.1, 5, 'F');
  doc.text(reshape('مقارنة المركبات'), startX - 3.5, y, { align: 'right' });
  y += 4;

  // Column order left→right so that "المركبة" lands rightmost (RTL reading).
  const head = ['الحكم', 'التغير %', 'التكلفة/كم', 'لتر/100كم', 'التكلفة (د.إ)', 'اللترات', 'كم', 'المركبة'].map(reshape);
  const body = vehicles.map((v) => [
    reshape(v.verdict ? VERDICT_AR[v.verdict] : '—'),
    pctCell(v.deltaL100?.pct),
    cell(v.costPerKm, 2),
    cell(v.litresPer100km, 1),
    cell(v.cost, 0),
    cell(v.litres, 0),
    cell(v.km, 0),
    v.plate,
  ]);

  autoTable(doc, {
    startY: y,
    head: [head],
    body,
    theme: 'grid',
    styles: {
      font: 'Cairo',
      fontSize: 8.5,
      halign: 'right',
      cellPadding: { top: 2.2, right: 3, bottom: 2.2, left: 3 },
      lineColor: HAIRLINE,
      lineWidth: 0.3,
      textColor: INK,
    },
    headStyles: {
      font: 'Cairo',
      fontStyle: 'bold',
      fontSize: 8.5,
      fillColor: [255, 255, 255],
      textColor: INK,
      halign: 'right',
      lineColor: HAIRLINE,
      lineWidth: 0.3,
    },
    alternateRowStyles: { fillColor: PAPER_ALT },
    columnStyles: { 7: { fontStyle: 'bold' } },
    tableWidth: contentW,
    margin: { left: M, right: M, top: 20, bottom: 24 },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 12;

  /* ── Insights ── */
  const list = insights.slice(0, 6);
  if (list.length > 0) {
    if (y + 14 + list.length * 7 > H - 24) { doc.addPage(); y = 24; }
    doc.setFont('Cairo', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...INK);
    doc.setFillColor(...CRIMSON);
    doc.rect(startX, y - 3.6, 1.1, 5, 'F');
    doc.text(reshape('أبرز الملاحظات'), startX - 3.5, y, { align: 'right' });
    y += 8;

    doc.setFont('Cairo', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    list.forEach((ins) => {
      const lines = doc.splitTextToSize(reshape(ins.ar || ins.en || ''), contentW - 6);
      lines.forEach((line, li) => {
        if (y > H - 24) { doc.addPage(); y = 24; }
        if (li === 0) {
          doc.setFillColor(...CRIMSON);
          doc.rect(startX - 1.6, y - 1.9, 1.6, 1.6, 'F');
        }
        doc.text(line, startX - 5, y, { align: 'right' });
        y += 6;
      });
      y += 1.5;
    });
  }

  /* ── Footer on every page ── */
  const pages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    hairline(H - 16);
    doc.setFont('Cairo', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(reshape(`تقرير الوقود — ${monthAr}`), W - M, H - 10, { align: 'right' });
    doc.text('FMAC Logistics Hub', M, H - 10, { align: 'left' });
    doc.text(`${p} / ${pages}`, W / 2, H - 10, { align: 'center' });
  }

  doc.save(`fuel-report-${year}-${String(month).padStart(2, '0')}.pdf`);
}
