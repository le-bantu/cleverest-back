import { assertFileAllowed, fileExtension, MAX_UPLOAD_BYTES } from './stored-file';

describe('stored-file', () => {
  const pdfOnly = { maxBytes: 100, extensions: ['.pdf'] };

  it('extracts a lower-cased extension', () => {
    expect(fileExtension('Contrat.PDF')).toBe('.pdf');
    expect(fileExtension('README')).toBe('');
  });

  it('accepts a file matching the policy', () => {
    expect(() => assertFileAllowed({ originalName: 'a.pdf', size: 10 }, pdfOnly)).not.toThrow();
    expect(() =>
      assertFileAllowed({ originalName: 'x.zip', size: 10 }, { maxBytes: 100, extensions: [] }),
    ).not.toThrow();
  });

  it.each([
    [{ originalName: 'a.pdf', size: 0 }, 'FILE_EMPTY'],
    [{ originalName: 'a.pdf', size: 101 }, 'FILE_TOO_LARGE'],
    [{ originalName: 'a.docx', size: 10 }, 'FILE_TYPE_NOT_ALLOWED'],
  ])('refuses %o with %s', (file, code) => {
    expect(() => assertFileAllowed(file, pdfOnly)).toThrow(expect.objectContaining({ code }));
  });

  it('exposes the default upload cap (10 MB)', () => {
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
  });
});
