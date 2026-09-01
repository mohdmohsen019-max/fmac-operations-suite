import * as XLSX from 'xlsx';

export const exportToExcel = (data, filename = 'exported_data') => {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  const containsArabic = (value) => /[\u0600-\u06FF]/u.test(String(value || ''));
  const rightToLeft = (data || []).some((row) => Object.entries(row || {}).some(([key, value]) => containsArabic(key) || containsArabic(value)));
  if (rightToLeft) workbook.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  
  // Clean column widths based on keys
  const colWidths = Object.keys(data[0] || {}).map(key => ({ wch: Math.max(key.length, 15) }));
  worksheet['!cols'] = colWidths;

  XLSX.writeFile(workbook, `${filename}.xlsx`);
};

export const exportToCSV = (data, filename = 'exported_data') => {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const printToPDF = () => {
  // Triggers native browser high-quality PDF vector print
  window.print();
};
