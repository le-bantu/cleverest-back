import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { MAX_UPLOAD_BYTES } from '@shared/kernel';
import { Roles } from '@shared/interface/http/decorators/roles.decorator';
import { RequirePermissions } from '@shared/interface/http/decorators/require-permissions.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '@shared/interface/http/decorators/current-user.decorator';
import { actorOf, sendFile, toIncomingFile } from '@shared/interface/http/http-helpers';
import {
  DownloadConsultantInvoiceUseCase,
  ListConsultantInvoicesUseCase,
  MarkConsultantInvoicePaidUseCase,
  SubmitConsultantInvoiceUseCase,
} from '../../application';
import {
  AdminListConsultantInvoicesQuery,
  ListConsultantInvoicesQuery,
  SubmitConsultantInvoiceRequest,
} from './dto/consultant-invoice.request';

/** `/consultant/invoices` — invoices the consultant sends to The Cleverest. */
@ApiTags('consultant invoices')
@ApiBearerAuth()
@Controller('consultant/invoices')
export class ConsultantInvoicesConsultantController {
  constructor(
    private readonly submitInvoice: SubmitConsultantInvoiceUseCase,
    private readonly listInvoices: ListConsultantInvoicesUseCase,
    private readonly downloadInvoice: DownloadConsultantInvoiceUseCase,
  ) {}

  @Post()
  @HttpCode(201)
  @Roles('consultant')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: SubmitConsultantInvoiceRequest })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: SubmitConsultantInvoiceRequest,
  ) {
    return this.submitInvoice.execute({
      actor: actorOf(user),
      missionId: body.missionId,
      amount: body.amount,
      file: toIncomingFile(file),
    });
  }

  @Get()
  @Roles('consultant')
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListConsultantInvoicesQuery) {
    return this.listInvoices.execute({ actor: actorOf(user), ...query });
  }

  @Get(':id/download')
  @Roles('consultant', 'admin', 'superadmin')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return sendFile(
      res,
      await this.downloadInvoice.execute({ actor: actorOf(user), invoiceId: id }),
    );
  }
}

@ApiTags('consultant invoices (admin)')
@ApiBearerAuth()
@Controller('admin/invoices')
@Roles('admin', 'superadmin')
export class ConsultantInvoicesAdminController {
  constructor(
    private readonly listInvoices: ListConsultantInvoicesUseCase,
    private readonly downloadInvoice: DownloadConsultantInvoiceUseCase,
    private readonly markPaid: MarkConsultantInvoicePaidUseCase,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: AdminListConsultantInvoicesQuery) {
    return this.listInvoices.execute({ actor: actorOf(user), ...query });
  }

  @Get(':id/download')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return sendFile(
      res,
      await this.downloadInvoice.execute({ actor: actorOf(user), invoiceId: id }),
    );
  }

  @Patch(':id/pay')
  @RequirePermissions('pay-consultants')
  pay(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.markPaid.execute({ actor: actorOf(user), invoiceId: id });
  }
}
