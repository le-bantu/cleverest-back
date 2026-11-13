import { Injectable } from '@nestjs/common';
import {
  PdfBlock,
  PdfDocumentDefinition,
  PdfGeneratorPort,
  PdfTextStyle,
} from '@shared/application/ports/pdf-generator.port';

const PAGE = { width: 595, height: 842, margin: 56 } as const; // A4, points
const SIZES: Record<PdfTextStyle, number> = { title: 20, heading: 13, body: 11, small: 9 };
/** Helvetica average glyph width ≈ 0.5 em — good enough to wrap invoice text */
const AVG_GLYPH = 0.52;

/** Unicode → Windows-1252 byte, for the standard Type1 fonts (WinAnsiEncoding). */
const CP1252_EXTRA: Record<string, number> = {
  '€': 0x80,
  '‚': 0x82,
  ƒ: 0x83,
  '„': 0x84,
  '…': 0x85,
  '†': 0x86,
  '‡': 0x87,
  ˆ: 0x88,
  '‰': 0x89,
  Š: 0x8a,
  '‹': 0x8b,
  Œ: 0x8c,
  Ž: 0x8e,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '˜': 0x98,
  '™': 0x99,
  š: 0x9a,
  '›': 0x9b,
  œ: 0x9c,
  ž: 0x9e,
  Ÿ: 0x9f,
  ' ': 0x20,
  ' ': 0x20,
};

/** Text as a latin1 "binary string" (1 char = 1 byte), escaped for a PDF literal. */
export const encodePdfText = (text: string): string => {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    const byte = CP1252_EXTRA[ch] ?? (code < 0x80 || (code >= 0xa0 && code <= 0xff) ? code : 0x3f);
    const c = String.fromCharCode(byte);
    out += c === '\\' || c === '(' || c === ')' ? `\\${c}` : c;
  }
  return out;
};

export const wrapText = (text: string, maxChars: number): string[] => {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (!line) line = word;
      else if (line.length + 1 + word.length <= maxChars) line += ` ${word}`;
      else {
        lines.push(line);
        line = word;
      }
      while (line.length > maxChars) {
        lines.push(line.slice(0, maxChars));
        line = line.slice(maxChars);
      }
    }
    lines.push(line);
  }
  return lines;
};

interface PlacedLine {
  font: 'F1' | 'F2';
  size: number;
  y: number;
  text: string;
}

/**
 * Dependency-free PDF 1.4 writer: A4 pages, Helvetica / Helvetica-Bold,
 * wrapped paragraphs, automatic page breaks. Enough for invoices; swap the
 * adapter for a richer engine (pdfmake, …) behind the same port if needed.
 */
@Injectable()
export class SimplePdfGeneratorAdapter extends PdfGeneratorPort {
  generate(definition: PdfDocumentDefinition): Promise<Buffer> {
    return Promise.resolve(this.render(definition));
  }

  private layout(blocks: readonly PdfBlock[]): PlacedLine[][] {
    const pages: PlacedLine[][] = [[]];
    const usable = PAGE.width - 2 * PAGE.margin;
    let y = PAGE.height - PAGE.margin;
    for (const block of blocks) {
      const style = block.style ?? 'body';
      const size = SIZES[style];
      const font = block.bold || style === 'title' || style === 'heading' ? 'F2' : 'F1';
      const leading = Math.round(size * 1.35);
      y -= block.spaceBefore ?? 0;
      for (const text of wrapText(block.text, Math.floor(usable / (size * AVG_GLYPH)))) {
        if (y - leading < PAGE.margin) {
          pages.push([]);
          y = PAGE.height - PAGE.margin;
        }
        y -= leading;
        pages[pages.length - 1].push({ font, size, y, text });
      }
    }
    return pages;
  }

  private render(definition: PdfDocumentDefinition): Buffer {
    const pages = this.layout(definition.blocks);
    // object numbers: 1 catalog, 2 pages, 3 F1, 4 F2, 5 info, then (page, content) pairs
    const objects: string[] = [];
    const pageRefs = pages.map((_, i) => 6 + i * 2);
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[2] = `<< /Type /Pages /Kids [${pageRefs.map((n) => `${n} 0 R`).join(' ')}] /Count ${pages.length} >>`;
    objects[3] =
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objects[4] =
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    objects[5] = `<< /Title (${encodePdfText(definition.title)}) /Producer (The Cleverest) >>`;
    pages.forEach((lines, i) => {
      const stream = lines
        .map(
          (l) =>
            `BT /${l.font} ${l.size} Tf ${PAGE.margin} ${l.y} Td (${encodePdfText(l.text)}) Tj ET`,
        )
        .join('\n');
      objects[pageRefs[i]] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageRefs[i] + 1} 0 R >>`;
      objects[pageRefs[i] + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    });

    let body = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const offsets: number[] = [];
    for (let n = 1; n < objects.length; n++) {
      offsets[n] = body.length;
      body += `${n} 0 obj\n${objects[n]}\nendobj\n`;
    }
    const xref = body.length;
    body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let n = 1; n < objects.length; n++) {
      body += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
    }
    body +=
      `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 5 0 R >>\n` +
      `startxref\n${xref}\n%%EOF\n`;
    return Buffer.from(body, 'latin1');
  }
}
