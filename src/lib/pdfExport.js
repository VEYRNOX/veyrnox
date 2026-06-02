// src/lib/pdfExport.js
//
// CLIENT-SIDE PDF EXPORT (base44 removal, Phase 3).
//
// Replaces the old `generateDocumentationPDF` / `generateArchitectureDocuments`
// server functions. Those ran jsPDF on a Deno backend and uploaded the result
// to Google Drive (a hosted connector). Here we run the SAME library — jsPDF,
// already vendored as a top-level dependency ("jspdf" in package.json) — in the
// browser and hand the file straight to the user via a normal download.
//
// NETWORK CALLS: NONE. Everything (rendering + the download) happens on-device.
// There is no Google Drive step and no backend; nothing leaves the machine.
//
// The content is driven by whatever catalogue the calling page already renders,
// so the PDF can never drift from the on-screen feature list.

import { jsPDF } from "jspdf";

const BRAND = [255, 107, 53]; // Veyrnox orange (matches the old server template)

/**
 * Build and download a feature-catalogue PDF entirely in the browser.
 *
 * @param {object}   opts
 * @param {string}   opts.title      Document title (e.g. "Veyrnox Documentation").
 * @param {string}  [opts.subtitle]  Optional sub-title under the brand band.
 * @param {Array}    opts.categories Normalised catalogue:
 *                                   [{ category: string,
 *                                      items: [{ name, desc, status }] }]
 * @param {string}  [opts.fileName]  Override the download filename.
 */
export function exportCataloguePdf({ title, subtitle, categories = [], fileName }) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  const dateStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  // ── Title band ──
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, pageWidth, 50, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(26);
  doc.setFont("helvetica", "bold");
  doc.text("Veyrnox", pageWidth / 2, 22, { align: "center" });
  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.text(title, pageWidth / 2, 32, { align: "center" });
  doc.setFontSize(9);
  doc.text(`Generated ${dateStr}`, pageWidth / 2, 42, { align: "center" });

  let y = 62;
  if (subtitle) {
    doc.setTextColor(90, 90, 90);
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    const lines = doc.splitTextToSize(subtitle, contentWidth);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 4;
  }

  // ── Totals ──
  const allItems = categories.flatMap((c) => c.items || []);
  const available = allItems.filter((i) => i.status === "available").length;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(
    `${allItems.length} features across ${categories.length} categories — ${available} available today, ${allItems.length - available} on the roadmap.`,
    margin,
    y,
  );
  y += 8;

  const ensureSpace = (needed) => {
    if (y + needed > pageHeight - 15) {
      doc.addPage();
      y = margin;
    }
  };

  // ── Categories ──
  categories.forEach((cat) => {
    ensureSpace(14);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND);
    doc.text(cat.category, margin, y);
    y += 6;

    (cat.items || []).forEach((item) => {
      ensureSpace(10);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      const tag = item.status === "available" ? "[Available]" : "[Roadmap]";
      const head = doc.splitTextToSize(`• ${item.name}  ${tag}`, contentWidth);
      doc.text(head, margin, y);
      y += head.length * 4.5;

      if (item.desc) {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(90, 90, 90);
        const body = doc.splitTextToSize(item.desc, contentWidth - 4);
        ensureSpace(body.length * 4 + 2);
        doc.text(body, margin + 4, y);
        y += body.length * 4 + 2;
      }
    });
    y += 4;
  });

  // ── Footer on every page ──
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: "right" });
    doc.text("Veyrnox · generated on-device", margin, pageHeight - 10);
  }

  const name = fileName || `Veyrnox_${title.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`;
  // Triggers a normal browser download — no server, no upload.
  doc.save(name);
}
