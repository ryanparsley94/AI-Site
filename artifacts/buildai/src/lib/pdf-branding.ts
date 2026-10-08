import type { Company } from "@workspace/api-client-react";
import type { UserOptions } from "jspdf-autotable";

export const PDF_INK: [number, number, number] = [13, 23, 28];

export function pdfBranding(company?: Company | null) {
  const template = company?.quoteTemplate || "classic";
  const hex = company?.quoteAccentColor || "#36C6D5";
  const accent: [number, number, number] = /^#[0-9a-f]{6}$/i.test(hex)
    ? [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
    : [54, 198, 213];
  const headStyles: UserOptions["headStyles"] = template === "minimal"
    ? { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3 }
    : { fillColor: template === "modern" ? accent : PDF_INK, textColor: 255 };
  return { template, accent, headStyles, theme: template === "minimal" ? "grid" as const : "striped" as const };
}

// Rasterize browser-supported logos (including SVG/WebP) for reliable PDF embedding.
export async function loadPdfLogo(url?: string | null) {
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("Logo request failed");
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      if (!image.naturalWidth || !image.naturalHeight) throw new Error("Empty logo");
      const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Cannot render logo");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return { data: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    throw new Error("The company logo could not be loaded. Check the logo in Settings and try again.");
  }
}
