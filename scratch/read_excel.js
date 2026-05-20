const XLSX = require('xlsx');
try {
  const wb = XLSX.readFile('C:\\Users\\mohdm\\Downloads\\FMAC_Requests_All_2026-05-18.xlsx', { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws);
  if (data.length > 0) {
    console.log("Columns:", Object.keys(data[0]));
    console.log("First row:", data[0]);
  } else {
    console.log("Empty sheet.");
  }
} catch (e) {
  console.error("Error:", e);
}
