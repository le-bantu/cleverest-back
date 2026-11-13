import { encodePdfText, SimplePdfGeneratorAdapter, wrapText } from './simple-pdf-generator.adapter';

const objectOffsets = (pdf: string): Array<[number, number]> => {
  const start = pdf.lastIndexOf('xref\n');
  const lines = pdf.slice(start).split('\n');
  const count = Number(lines[1].split(' ')[1]);
  return lines.slice(3, 2 + count).map((l, i) => [i + 1, Number(l.slice(0, 10))]);
};

describe('SimplePdfGeneratorAdapter', () => {
  const pdf = new SimplePdfGeneratorAdapter();

  it('produces a well-formed PDF whose xref points at every object', async () => {
    const buf = await pdf.generate({
      title: 'Facture FAC-2026-0001',
      blocks: [
        { text: 'THE CLEVEREST', style: 'title' },
        { text: 'Montant : 1 234,56 €', bold: true, spaceBefore: 12 },
        { text: 'Note (interne) \\ test', style: 'small' },
      ],
    });
    const text = buf.toString('latin1');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    for (const [n, offset] of objectOffsets(text)) {
      expect(text.slice(offset, offset + `${n} 0 obj`.length)).toBe(`${n} 0 obj`);
    }
    const startxref = Number(text.split('startxref\n')[1].split('\n')[0]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
    expect(text).toContain('(THE CLEVEREST) Tj');
    expect(text).toContain('/F2 11 Tf');
    expect(buf.includes(Buffer.from([0x80]))).toBe(true); // € in WinAnsi
    expect(text).toContain('Note \\(interne\\) \\\\ test');
    expect(text).toContain('/Count 1');
  });

  it('breaks pages when the content overflows', async () => {
    const blocks = Array.from({ length: 120 }, (_, i) => ({ text: `Ligne ${i}` }));
    const text = (await pdf.generate({ title: 'Long', blocks })).toString('latin1');
    expect(text).toContain('/Count 3');
    expect(text).toContain('(Ligne 119) Tj');
  });

  it('encodes accents in WinAnsi and replaces unsupported characters', () => {
    expect(Buffer.from(encodePdfText('é à ç'), 'latin1')).toEqual(
      Buffer.from([0xe9, 0x20, 0xe0, 0x20, 0xe7]),
    );
    expect(encodePdfText('漢 – ok x')).toBe('? \x96 ok x');
  });

  it('wraps on words, splits words longer than a line, keeps blank lines', () => {
    expect(wrapText('un deux trois quatre', 9)).toEqual(['un deux', 'trois', 'quatre']);
    expect(wrapText('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
    expect(wrapText('a\n\nb', 10)).toEqual(['a', '', 'b']);
  });
});
