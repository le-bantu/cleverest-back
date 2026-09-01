export const FILE_STORAGE = Symbol('FILE_STORAGE');

export interface StoredFile {
  key: string;
  size: number;
  contentType?: string;
}

export interface PutFileInput {
  key: string;
  content: Buffer;
  contentType?: string;
}

/**
 * Abstraction over file persistence. Local adapter in dev, S3 in prod.
 * No controller / use case ever touches the disk directly.
 */
export abstract class FileStoragePort {
  abstract put(input: PutFileInput): Promise<StoredFile>;
  abstract get(key: string): Promise<Buffer>;
  abstract delete(key: string): Promise<void>;
  abstract exists(key: string): Promise<boolean>;
  abstract url(key: string): Promise<string>;
}
