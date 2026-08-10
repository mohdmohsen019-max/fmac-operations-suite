/**
 * Tiny CSV exporter — Excel-safe (BOM for Arabic), RFC-4180 quoting.
 * rows: array of arrays; headers: array of strings.
 */
export default function exportCsv(filename, headers, rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + [
    headers.map(esc).join(','),
    ...rows.map(r => r.map(esc).join(',')),
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
