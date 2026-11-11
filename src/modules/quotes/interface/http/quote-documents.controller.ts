import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  Type,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ValidationException } from '@shared/kernel';
import { Roles } from '@shared/interface/http/decorators/roles.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '@shared/interface/http/decorators/current-user.decorator';
import {
  DeleteQuoteDocumentUseCase,
  DownloadQuoteDocumentUseCase,
  ListQuoteDocumentsUseCase,
  UploadQuoteDocumentUseCase,
} from '../../application';
import { DOCUMENT_MAX_BYTES } from '../../domain';
import { UploadDocumentRequest } from './dto/quote.request';
import { actorOf } from './actor';

/**
 * Same document endpoints exposed under each audience prefix
 * (`quotes/:quoteId/documents`, `consultant/quotes/...`, `admin/quotes/...`).
 * Visibility and ownership are enforced in the use cases.
 */
export const createQuoteDocumentsController = (
  prefix: string,
  roles: string[],
  tag: string,
): Type<unknown> => {
  @ApiTags(tag)
  @ApiBearerAuth()
  @Controller(`${prefix}/:quoteId/documents`)
  @Roles(...roles)
  class QuoteDocumentsController {
    constructor(
      readonly uploadDocument: UploadQuoteDocumentUseCase,
      readonly listDocuments: ListQuoteDocumentsUseCase,
      readonly downloadDocument: DownloadQuoteDocumentUseCase,
      readonly deleteDocument: DeleteQuoteDocumentUseCase,
    ) {}

    @Get()
    list(
      @CurrentUser() user: AuthenticatedUser,
      @Param('quoteId', new ParseUUIDPipe()) quoteId: string,
    ) {
      return this.listDocuments.execute({ actor: actorOf(user), quoteId });
    }

    @Post()
    @HttpCode(201)
    @ApiConsumes('multipart/form-data')
    @ApiBody({ type: UploadDocumentRequest })
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: DOCUMENT_MAX_BYTES } }))
    upload(
      @CurrentUser() user: AuthenticatedUser,
      @Param('quoteId', new ParseUUIDPipe()) quoteId: string,
      @UploadedFile() file: Express.Multer.File | undefined,
      @Body() body: UploadDocumentRequest,
    ) {
      if (!file) throw new ValidationException('FILE_REQUIRED', 'A "file" field is required');
      return this.uploadDocument.execute({
        actor: actorOf(user),
        quoteId,
        file: {
          buffer: file.buffer,
          originalName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
          mimeType: file.mimetype || null,
          size: file.size,
        },
        label: body.label,
        comment: body.comment,
        visibility: body.visibility,
        visibleUsers: body.visibleUsers,
      });
    }

    @Get(':documentId/download')
    async download(
      @CurrentUser() user: AuthenticatedUser,
      @Param('quoteId', new ParseUUIDPipe()) quoteId: string,
      @Param('documentId', new ParseUUIDPipe()) documentId: string,
      @Res({ passthrough: true }) res: Response,
    ): Promise<StreamableFile> {
      const doc = await this.downloadDocument.execute({
        actor: actorOf(user),
        quoteId,
        documentId,
      });
      res.set({
        'Content-Type': doc.mimeType,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
      });
      return new StreamableFile(doc.content);
    }

    @Delete(':documentId')
    @HttpCode(204)
    async remove(
      @CurrentUser() user: AuthenticatedUser,
      @Param('quoteId', new ParseUUIDPipe()) quoteId: string,
      @Param('documentId', new ParseUUIDPipe()) documentId: string,
    ) {
      await this.deleteDocument.execute({ actor: actorOf(user), quoteId, documentId });
    }
  }
  return QuoteDocumentsController;
};

export const ClientQuoteDocumentsController = createQuoteDocumentsController(
  'quotes',
  ['client'],
  'quote documents (client)',
);
export const ConsultantQuoteDocumentsController = createQuoteDocumentsController(
  'consultant/quotes',
  ['consultant'],
  'quote documents (consultant)',
);
export const AdminQuoteDocumentsController = createQuoteDocumentsController(
  'admin/quotes',
  ['admin', 'superadmin'],
  'quote documents (admin)',
);
