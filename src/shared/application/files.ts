import { StoredFileRef } from '@shared/kernel';
import { FileStoragePort } from './ports/file-storage.port';

/** A file received by the interface layer (multipart), already in memory. */
export interface IncomingFile {
  buffer: Buffer;
  originalName: string;
  mimeType: string | null;
  size: number;
}

/** What a download use case hands back to the interface layer. */
export interface DownloadedFile {
  content: Buffer;
  fileName: string;
  mimeType: string;
}

export const toStoredRef = (key: string, file: IncomingFile): StoredFileRef => ({
  key,
  originalName: file.originalName,
  mimeType: file.mimeType,
  size: file.size,
});

/**
 * Writes the file, then runs `persist`. If persisting fails the file is removed
 * again so storage never keeps orphans of a failed command.
 */
export const storeThenPersist = async <T>(
  storage: FileStoragePort,
  ref: StoredFileRef,
  content: Buffer,
  persist: () => Promise<T>,
): Promise<T> => {
  await storage.put({ key: ref.key, content, contentType: ref.mimeType ?? undefined });
  try {
    return await persist();
  } catch (error) {
    await storage.delete(ref.key);
    throw error;
  }
};

export const download = async (
  storage: FileStoragePort,
  ref: StoredFileRef,
): Promise<DownloadedFile> => ({
  content: await storage.get(ref.key),
  fileName: ref.originalName,
  mimeType: ref.mimeType ?? 'application/octet-stream',
});
