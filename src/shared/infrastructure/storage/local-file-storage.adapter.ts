import { promises as fs } from 'fs';
import * as path from 'path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@shared/kernel';
import {
  FileStoragePort,
  PutFileInput,
  StoredFile,
} from '@shared/application/ports/file-storage.port';
import type { Env } from '../config/env.schema';

@Injectable()
export class LocalFileStorageAdapter extends FileStoragePort {
  private readonly root: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.root = path.resolve(config.get('STORAGE_LOCAL_ROOT', { infer: true }));
  }

  private resolveKey(key: string): string {
    const normalized = path
      .normalize(key)
      .replace(/^(\.\.(\/|\\|$))+/, '')
      .replace(/^([/\\])+/, '');
    const full = path.resolve(this.root, normalized);
    if (!full.startsWith(this.root + path.sep) && full !== this.root) {
      throw new NotFoundException('FILE_KEY_INVALID', 'Resolved path escapes storage root');
    }
    return full;
  }

  async put(input: PutFileInput): Promise<StoredFile> {
    const full = this.resolveKey(input.key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, input.content);
    return { key: input.key, size: input.content.byteLength, contentType: input.contentType };
  }

  async get(key: string): Promise<Buffer> {
    try {
      return await fs.readFile(this.resolveKey(key));
    } catch {
      throw new NotFoundException('FILE_NOT_FOUND', `No stored file for key "${key}"`);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolveKey(key));
    } catch {
      /* idempotent */
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }

  url(key: string): Promise<string> {
    return Promise.resolve(`file://${this.resolveKey(key)}`);
  }
}
