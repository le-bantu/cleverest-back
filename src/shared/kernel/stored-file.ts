import { ValidationException } from './domain-exception';

/** Metadata of a file kept in `FileStoragePort` (the key is never a filesystem path). */
export interface StoredFileRef {
  key: string;
  originalName: string;
  mimeType: string | null;
  size: number;
}

/** Accepted size / extensions for an upload. `extensions` empty = any type. */
export interface FilePolicy {
  maxBytes: number;
  extensions: readonly string[];
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Lower-cased extension with its dot (`.pdf`), or '' when there is none. */
export const fileExtension = (name: string): string =>
  /\.[A-Za-z0-9]{1,10}$/.exec(name)?.[0].toLowerCase() ?? '';

/** Refuses empty, oversized or wrongly typed uploads (422). */
export const assertFileAllowed = (
  file: Pick<StoredFileRef, 'originalName' | 'size'>,
  policy: FilePolicy,
): void => {
  if (file.size <= 0) {
    throw new ValidationException('FILE_EMPTY', 'The uploaded file is empty');
  }
  if (file.size > policy.maxBytes) {
    throw new ValidationException(
      'FILE_TOO_LARGE',
      `The uploaded file exceeds ${Math.round(policy.maxBytes / 1024 / 1024)} MB`,
      { maxBytes: policy.maxBytes },
    );
  }
  if (policy.extensions.length && !policy.extensions.includes(fileExtension(file.originalName))) {
    throw new ValidationException(
      'FILE_TYPE_NOT_ALLOWED',
      `Allowed file types: ${policy.extensions.join(', ')}`,
      { allowed: [...policy.extensions] },
    );
  }
};
