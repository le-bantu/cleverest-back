import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FILE_STORAGE, FileStoragePort } from '@shared/application/ports/file-storage.port';
import type { Env } from '../config/env.schema';
import { LocalFileStorageAdapter } from './local-file-storage.adapter';
import { S3FileStorageAdapter } from './s3-file-storage.adapter';

const fileStorageFactory = {
  provide: FILE_STORAGE,
  inject: [ConfigService, LocalFileStorageAdapter, S3FileStorageAdapter],
  useFactory: (
    config: ConfigService<Env, true>,
    local: LocalFileStorageAdapter,
    s3: S3FileStorageAdapter,
  ): FileStoragePort => (config.get('STORAGE_DRIVER', { infer: true }) === 's3' ? s3 : local),
};

@Global()
@Module({
  providers: [
    LocalFileStorageAdapter,
    S3FileStorageAdapter,
    fileStorageFactory,
    { provide: FileStoragePort, useExisting: FILE_STORAGE },
  ],
  exports: [FILE_STORAGE, FileStoragePort],
})
export class FileStorageModule {}
