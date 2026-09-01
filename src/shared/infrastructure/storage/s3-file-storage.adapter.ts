import { Injectable } from '@nestjs/common';
import {
  FileStoragePort,
  PutFileInput,
  StoredFile,
} from '@shared/application/ports/file-storage.port';

/**
 * Placeholder S3 adapter — wired in prod (STORAGE_DRIVER=s3). The concrete
 * AWS SDK integration lands with the deployment work (lot 8); until then it
 * fails fast so a mis-set env is obvious.
 */
@Injectable()
export class S3FileStorageAdapter extends FileStoragePort {
  private fail(): never {
    throw new Error('S3FileStorageAdapter is not implemented yet (STORAGE_DRIVER=s3)');
  }

  put(_input: PutFileInput): Promise<StoredFile> {
    return this.fail();
  }
  get(_key: string): Promise<Buffer> {
    return this.fail();
  }
  delete(_key: string): Promise<void> {
    return this.fail();
  }
  exists(_key: string): Promise<boolean> {
    return this.fail();
  }
  url(_key: string): Promise<string> {
    return this.fail();
  }
}
