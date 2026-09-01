import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LocalFileStorageAdapter } from './local-file-storage.adapter';
import { NotFoundException } from '@shared/kernel';

describe('LocalFileStorageAdapter', () => {
  let root: string;
  let adapter: LocalFileStorageAdapter;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'cleverest-store-'));
    adapter = new LocalFileStorageAdapter({ get: () => root } as never);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('put then get round-trips the bytes', async () => {
    const stored = await adapter.put({ key: 'quotes/1/a.txt', content: Buffer.from('hello') });
    expect(stored).toEqual({ key: 'quotes/1/a.txt', size: 5, contentType: undefined });
    expect((await adapter.get('quotes/1/a.txt')).toString()).toBe('hello');
  });

  it('exists reflects presence', async () => {
    expect(await adapter.exists('nope.txt')).toBe(false);
    await adapter.put({ key: 'nope.txt', content: Buffer.from('x') });
    expect(await adapter.exists('nope.txt')).toBe(true);
  });

  it('delete is idempotent', async () => {
    await expect(adapter.delete('missing.txt')).resolves.toBeUndefined();
  });

  it('get on a missing key throws a domain NotFoundException', async () => {
    await expect(adapter.get('missing.txt')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('blocks path traversal outside the root', async () => {
    await adapter.put({ key: '../escape.txt', content: Buffer.from('x') });
    // normalized back inside the root, so it is retrievable under the sanitized key
    expect(await adapter.exists('escape.txt')).toBe(true);
    const outside = path.join(root, '..', 'escape.txt');
    await expect(fs.access(outside)).rejects.toBeDefined();
  });
});
