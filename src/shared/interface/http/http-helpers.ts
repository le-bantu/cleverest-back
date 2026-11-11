import { StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { ValidationException } from '@shared/kernel';
import { ActorContext } from '@shared/application/use-case';
import { DownloadedFile, IncomingFile } from '@shared/application/files';
import { AuthenticatedUser } from './decorators/current-user.decorator';

export const actorOf = (user: AuthenticatedUser): ActorContext => ({
  userId: user.userId,
  roles: user.roles,
  permissions: user.permissions,
});

/** Multer file → application `IncomingFile`; 422 FILE_REQUIRED when the field is missing. */
export const toIncomingFile = (
  file: Express.Multer.File | undefined,
  field = 'file',
): IncomingFile => {
  if (!file) throw new ValidationException('FILE_REQUIRED', `A "${field}" field is required`);
  return {
    buffer: file.buffer,
    // multer decodes multipart file names as latin1
    originalName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
    mimeType: file.mimetype || null,
    size: file.size,
  };
};

export const sendFile = (res: Response, file: DownloadedFile): StreamableFile => {
  res.set({
    'Content-Type': file.mimeType,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
  });
  return new StreamableFile(file.content);
};
