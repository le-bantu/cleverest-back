import { FakeFileStorage } from '@shared/testing/fakes';
import { download, storeThenPersist, toStoredRef } from './files';

describe('shared file helpers', () => {
  const file = { buffer: Buffer.from('abc'), originalName: 'a.pdf', mimeType: null, size: 3 };

  it('stores then persists; removes the file when persisting fails', async () => {
    const storage = new FakeFileStorage();
    const ref = toStoredRef('k/a.pdf', file);
    expect(ref).toEqual({ key: 'k/a.pdf', originalName: 'a.pdf', mimeType: null, size: 3 });
    expect(await storeThenPersist(storage, ref, file.buffer, () => Promise.resolve(7))).toBe(7);
    expect(storage.files.has('k/a.pdf')).toBe(true);

    const other = toStoredRef('k/b.pdf', file);
    await expect(
      storeThenPersist(storage, other, file.buffer, () => Promise.reject(new Error('db'))),
    ).rejects.toThrow('db');
    expect(storage.files.has('k/b.pdf')).toBe(false);
  });

  it('downloads with a default mime type', async () => {
    const storage = new FakeFileStorage();
    storage.files.set('k', Buffer.from('x'));
    expect(
      await download(storage, { key: 'k', originalName: 'n', mimeType: null, size: 1 }),
    ).toEqual({ content: Buffer.from('x'), fileName: 'n', mimeType: 'application/octet-stream' });
  });
});
