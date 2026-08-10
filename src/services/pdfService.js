import * as pdfjsLib from 'pdfjs-dist';

/* PDF.js worker — served from /public so it is delivered byte-for-byte.
   Anything resolved through the bundler (`new URL(..., import.meta.url)` or an
   `?url` import) gets handed to Vite's JS transform in dev, which rewrites this
   classic worker script into an ES module — a classic Worker cannot load that
   ("Cannot use import statement outside a module"). Files in /public bypass the
   pipeline entirely, so this works identically in dev and in the build.
   Keep public/pdf.worker.min.js in sync — `npm run sync-pdf-worker`. */
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

export const pdfService = {
  /**
   * Extract text from PDF using Anthropic Claude Vision API
   */
  async parseStatement(file, onProgress) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pagesBase64 = [];

      if (onProgress) onProgress('Rendering document pages for AI analysis...');
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        
        // Render page to canvas at 3.0 scale for high resolution
        const viewport = page.getViewport({ scale: 3.0 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        await page.render({ canvasContext: context, viewport }).promise;
        
        // Convert canvas to base64 PNG
        const base64Image = canvas.toDataURL('image/png').split(',')[1];
        pagesBase64.push(base64Image);
      }

      if (onProgress) onProgress('Analyzing document with AI...');

      const records = await this.callClaudeVisionAPI(pagesBase64);
      
      // Calculate totals for validation
      const totalAmount = records.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
      const totalVAT = records.reduce((sum, r) => sum + (parseFloat(r.vat) || 0), 0);
      const grandTotal = records.reduce((sum, r) => sum + (parseFloat(r.total) || 0), 0);

      // Validate against expected totals: 15,334.94 / 730.25
      const validation = {
        isCountValid: records.length >= 15,
        isTotalValid: Math.abs(grandTotal - 15334.94) < 1,
        isVatValid: Math.abs(totalVAT - 730.25) < 1,
        actualCount: records.length,
        actualTotal: grandTotal,
        actualVAT: totalVAT
      };

      return {
        success: true,
        records,
        statementPeriod: records.length > 0 ? this.inferPeriod(records) : 'Unknown',
        validation
      };
    } catch (error) {
      console.error('PDF Vision Processing Error:', error);
      return { success: false, error: error.message };
    }
  },

  async callClaudeVisionAPI(base64Images) {
    if (!import.meta.env.VITE_ANTHROPIC_API_KEY) {
      throw new Error('Anthropic API Key (VITE_ANTHROPIC_API_KEY) is missing in environment variables.');
    }

    const content = base64Images.map(img => ({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: img,
      },
    }));

    content.push({
      type: "text",
      text: `Extract all rows from this scanned invoice table and return ONLY a JSON array. No markdown, no explanation, no backticks. Just the raw JSON array.
               
Each object must have exactly these fields:
{
  "date": "DD/MM/YYYY",
  "invoiceNumber": "full invoice number e.g. 002785",
  "plateNumber": "5-digit number inside brackets before FUJ",
  "description": "all service descriptions for this row combined into one string",
  "amount": number,
  "vat": number,
  "total": number
}

Rules:
- Multi-line descriptions belong to the row with the most recent date above them
- Plate number is inside brackets like (37075 FUJ) — extract only the digits before FUJ
- Skip the header row and the totals row at the bottom
- Skip the signature and stamp area at the bottom
- amount, vat, total must be numbers not strings
- Return ONLY the JSON array, nothing else`
    });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: content
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Claude API Error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const text = data.content[0].text;
    
    try {
      // Clean up potential markdown formatting
      const cleaned = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      
      // Convert dates to ISO for internal consistency
      return parsed.map(r => ({
        ...r,
        date: this.convertToISO(r.date)
      }));
    } catch (e) {
      console.error('Failed to parse Claude JSON response:', text);
      throw new Error('AI returned invalid data format.');
    }
  },

  inferPeriod(records) {
    if (!records.length) return 'Unknown';
    const dates = records.map(r => r.date).filter(d => d && d.includes('-')).sort();
    if (!dates.length) return 'Unknown';
    const start = dates[0].split('-').reverse().join('.');
    const end = dates[dates.length - 1].split('-').reverse().join('.');
    return `${start}-${end}`;
  },

  convertToISO(dateStr) {
    if (!dateStr || !dateStr.includes('/')) return dateStr;
    const [d, m, y] = dateStr.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  },

  async generateMaintenanceReport(data) {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    
    const doc = new jsPDF();
    const primaryColor = [245, 158, 11]; // FMAC Amber
    
    // Header
    doc.setFillColor(15, 23, 42); // Dark slate
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('FMAC LOGISTICS HUB', 14, 20);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('FLEET MAINTENANCE INTELLIGENCE REPORT', 14, 28);
    
    doc.setTextColor(150, 150, 150);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 140, 28);

    // Summary Section
    const totalSpent = data.reduce((sum, item) => sum + item.spend, 0);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('EXPENDITURE SUMMARY', 14, 55);
    
    doc.setFont('helvetica', 'normal');
    doc.text(`Total Fleet Expenditure: ${totalSpent.toLocaleString()} AED`, 14, 65);
    doc.text(`Active Units Analyzed: ${data.length}`, 14, 72);

    // Table
    autoTable(doc, {
      startY: 85,
      head: [['VEHICLE PLATE', 'TOTAL EXPENDITURE (AED)', 'PERCENTAGE OF TOTAL']],
      body: data.map(item => [
        item.plate,
        item.spend.toLocaleString(),
        `${((item.spend / totalSpent) * 100).toFixed(1)}%`
      ]),
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [245, 158, 11],
        fontSize: 10,
        fontStyle: 'bold',
        halign: 'left'
      },
      styles: {
        fontSize: 9,
        cellPadding: 5
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      }
    });

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `FMAC Logistics Hub - Confidential Report - Page ${i} of ${pageCount}`,
        doc.internal.pageSize.width / 2,
        doc.internal.pageSize.height - 10,
        { align: 'center' }
      );
    }

    doc.save(`FMAC_Fleet_Maintenance_${new Date().toISOString().split('T')[0]}.pdf`);
  }
};
