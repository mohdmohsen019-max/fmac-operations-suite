import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parse } from 'date-fns';

export const reportService = {
  /**
   * Generates a professional maintenance report PDF
   */
  async generateMaintenanceReport(records, dateRange, currency = 'AED') {
    try {
      const doc = new jsPDF();
      const { start, end } = dateRange;
      
      // Conversion factors (based on AED base)
      const rates = {
        'AED': 1.0,
        'USD': 3.6725,
        'EUR': 4.01,
        'GBP': 4.72
      };
      const rate = rates[currency] || 1.0;
      const convert = (val) => Math.round((val / rate) * 100) / 100;

      // Add Branding & Title
      doc.setFillColor(10, 17, 40); // Dark Blue Theme
      doc.rect(0, 0, 210, 40, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text('FMAC LOGISTICS HUB', 15, 20);
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text('Fleet Maintenance Intelligence Report', 15, 30);
      
      // Metadata
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 150, 15);
      
      // Safe Date Parsing for start/end
      const startDateStr = start ? format(new Date(start), 'dd/MM/yyyy') : 'N/A';
      const endDateStr = end ? format(new Date(end), 'dd/MM/yyyy') : 'N/A';
      doc.text(`Period: ${startDateStr} - ${endDateStr}`, 150, 25);

      // Summary Statistics
      const totalAmount = records.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
      const totalVAT = records.reduce((sum, r) => sum + (parseFloat(r.vat) || 0), 0);
      const grandTotal = records.reduce((sum, r) => sum + (parseFloat(r.total) || 0), 0);

      doc.setTextColor(10, 17, 40);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Summary Information', 15, 55);
      
      autoTable(doc, {
        startY: 60,
        head: [['Metric', `Value (${currency})`]],
        body: [
          ['Total Records', records.length],
          ['Base Amount Total', convert(totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })],
          ['VAT Total', convert(totalVAT).toLocaleString(undefined, { minimumFractionDigits: 2 })],
          ['Grand Total (incl. VAT)', convert(grandTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })],
        ],
        theme: 'striped',
        headStyles: { fillColor: '#D4AF37', textColor: 255 },
        styles: { fontSize: 10 }
      });

      // Detailed Records Table
      const nextY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 15 : 120;
      doc.text('Detailed Maintenance Logs', 15, nextY);
      
      const tableData = records.map(r => {
        let dateDisplay = 'N/A';
        try {
          if (r.date) {
            const d = r.date.includes('-') 
              ? new Date(r.date) 
              : parse(r.date, 'dd/MM/yyyy', new Date());
            dateDisplay = format(d, 'dd/MM/yyyy');
          }
        } catch (e) {
          dateDisplay = r.date || 'N/A';
        }

        const desc = r.description || '';
        const shortDesc = desc.length > 50 ? desc.substring(0, 47) + '...' : desc;

        return [
          dateDisplay,
          r.plateNumber || 'N/A',
          r.invoiceNumber || 'N/A',
          shortDesc || 'No description',
          convert(parseFloat(r.total) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })
        ];
      });

      autoTable(doc, {
        startY: nextY + 5,
        head: [['Date', 'Plate', 'Invoice', 'Description', `Total (${currency})`]],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [10, 17, 40], textColor: 255 },
        styles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 20 },
          2: { cellWidth: 25 },
          3: { cellWidth: 'auto' },
          4: { cellWidth: 30, halign: 'right' }
        }
      });

      // Footer
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(
          `FMAC Logistics Hub - Confidential Fleet Data - Page ${i} of ${pageCount}`,
          doc.internal.pageSize.getWidth() / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: 'center' }
        );
      }

      doc.save(`FMAC_Maintenance_Report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    } catch (error) {
      console.error('PDF Generation Service Error:', error);
      throw error; // Re-throw to be caught by the UI
    }
  }
};

