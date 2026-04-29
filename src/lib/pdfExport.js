import { jsPDF } from "jspdf";

/**
 * Downloads a UTF-8 text body as a .pdf file (wrapped to page width).
 * @param {{ title?: string, body: string, filename: string }} opts
 */
export function downloadTextAsPdf({ title, body, filename }) {
  const doc = new jsPDF();
  const margin = 14;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const maxW = pageW - margin * 2;
  let y = margin + 6;

  const base = filename.replace(/\.pdf$/i, "");
  const outName = `${base}.pdf`;

  if (title != null && String(title).trim() !== "") {
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(title, margin, y);
    y += 10;
  }
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const lines = doc.splitTextToSize(String(body || "").trim(), maxW);
  const lineGap = 5;
  lines.forEach((line) => {
    if (y + lineGap > pageH - margin) {
      doc.addPage();
      y = margin + 6;
    }
    doc.text(line, margin, y);
    y += lineGap;
  });
  doc.save(outName);
}
