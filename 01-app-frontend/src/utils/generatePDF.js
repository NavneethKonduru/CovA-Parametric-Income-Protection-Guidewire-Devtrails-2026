import jsPDF from 'jspdf';
import 'jspdf-autotable';

/**
 * Generate a branded CovA PDF report
 * @param {string} title - Report title
 * @param {Array} sections - Array of { heading, type, data }
 *   type: 'kpi' | 'table' | 'text'
 *   For 'kpi': data = [{ label, value }]
 *   For 'table': data = { columns: [...], rows: [[...]] }
 *   For 'text': data = "paragraph text"
 */
export function generatePDF(title, sections, filename) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  // Header
  doc.setFillColor(15, 23, 42); // Dark navy
  doc.rect(0, 0, pageWidth, 35, 'F');
  doc.setTextColor(6, 182, 212); // Cyan
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('CovA', 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(200, 200, 200);
  doc.text('Coverage, Automated — Parametric Income Protection', 14, 26);
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, 26, { align: 'right' });
  
  y = 45;
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, y);
  y += 12;

  for (const section of sections) {
    if (y > 270) { doc.addPage(); y = 20; }

    // Section heading
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(6, 182, 212);
    doc.text(section.heading, 14, y);
    y += 8;
    doc.setTextColor(30, 30, 30);

    if (section.type === 'kpi') {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      for (const kpi of section.data) {
        doc.text(`${kpi.label}: `, 14, y);
        doc.setFont('helvetica', 'bold');
        doc.text(String(kpi.value), 80, y);
        doc.setFont('helvetica', 'normal');
        y += 6;
      }
      y += 4;
    }

    if (section.type === 'table') {
      doc.autoTable({
        startY: y,
        head: [section.data.columns],
        body: section.data.rows,
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42], textColor: [6, 182, 212], fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 10;
    }

    if (section.type === 'text') {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(section.data, pageWidth - 28);
      doc.text(lines, 14, y);
      y += lines.length * 5 + 6;
    }
  }

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`CovA Report — Team ClaimCrypt — Page ${i}/${pageCount}`, pageWidth / 2, 290, { align: 'center' });
  }

  doc.save(filename || `CovA_Report_${Date.now()}.pdf`);
}
