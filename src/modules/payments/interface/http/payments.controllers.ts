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
  DownloadClientInvoiceUseCase,
  DownloadPaymentProofUseCase,
  GenerateClientInvoiceUseCase,
  GetPaymentUseCase,
  ListClientInvoicesUseCase,
  ListPaymentsUseCase,
  SendClientInvoiceUseCase,
  SubmitPaymentUseCase,
  ValidatePaymentUseCase,
} from '../../application';
import {
  AdminListClientInvoicesQuery,
  AdminListPaymentsQuery,
  ListClientInvoicesQuery,
  ListPaymentsQuery,
  SubmitPaymentRequest,
} from './dto/payment.request';

/** `/payments` — the client's declared payments (GET one / download also open to admins). */
@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsClientController {
  constructor(
    private readonly submitPayment: SubmitPaymentUseCase,
    private readonly listPayments: ListPaymentsUseCase,
    private readonly getPayment: GetPaymentUseCase,
    private readonly downloadProof: DownloadPaymentProofUseCase,
  ) {}

  @Post()
  @HttpCode(201)
  @Roles('client')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: SubmitPaymentRequest })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: SubmitPaymentRequest,
  ) {
    return this.submitPayment.execute({
      actor: actorOf(user),
      missionId: body.missionId,
      amount: body.amount,
      file: toIncomingFile(file),
    });
  }

  @Get()
  @Roles('client')
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListPaymentsQuery) {
    return this.listPayments.execute({ actor: actorOf(user), ...query });
  }

  @Get(':id')
  @Roles('client', 'admin', 'superadmin')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.getPayment.execute({ actor: actorOf(user), paymentId: id });
  }

  @Get(':id/download')
  @Roles('client', 'admin', 'superadmin')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return sendFile(res, await this.downloadProof.execute({ actor: actorOf(user), paymentId: id }));
  }
}

/** `/consultant/payments` — payments of the missions the consultant works on (no proof). */
@ApiTags('payments (consultant)')
@ApiBearerAuth()
@Controller('consultant/payments')
@Roles('consultant')
export class PaymentsConsultantController {
  constructor(private readonly listPayments: ListPaymentsUseCase) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListPaymentsQuery) {
    return this.listPayments.execute({ actor: actorOf(user), ...query });
  }
}

@ApiTags('payments (admin)')
@ApiBearerAuth()
@Controller('admin/payments')
@Roles('admin', 'superadmin')
export class PaymentsAdminController {
  constructor(
    private readonly listPayments: ListPaymentsUseCase,
    private readonly getPayment: GetPaymentUseCase,
    private readonly downloadProof: DownloadPaymentProofUseCase,
    private readonly validatePayment: ValidatePaymentUseCase,
    private readonly generateInvoice: GenerateClientInvoiceUseCase,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: AdminListPaymentsQuery) {
    return this.listPayments.execute({ actor: actorOf(user), ...query });
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.getPayment.execute({ actor: actorOf(user), paymentId: id });
  }

  @Get(':id/download')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return sendFile(res, await this.downloadProof.execute({ actor: actorOf(user), paymentId: id }));
  }

  @Patch(':id/validate')
  @RequirePermissions('validate-payments')
  validate(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.validatePayment.execute({ actor: actorOf(user), paymentId: id });
  }

  /** Generates the client invoice PDF of a validated payment. */
  @Post(':id/invoice')
  @HttpCode(201)
  @RequirePermissions('validate-payments')
  invoice(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.generateInvoice.execute({ actor: actorOf(user), paymentId: id });
  }
}

@ApiTags('client invoices (admin)')
@ApiBearerAuth()
@Controller('admin/client-invoices')
@Roles('admin', 'superadmin')
export class ClientInvoicesAdminController {
  constructor(
    private readonly listInvoices: ListClientInvoicesUseCase,
    private readonly sendInvoice: SendClientInvoiceUseCase,
    private readonly downloadInvoice: DownloadClientInvoiceUseCase,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: AdminListClientInvoicesQuery) {
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

  @Post(':id/send')
  @HttpCode(200)
  @RequirePermissions('validate-payments')
  send(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.sendInvoice.execute({ actor: actorOf(user), invoiceId: id });
  }
}

/** `/client/invoices` — the client's invoices (download also open to admins). */
@ApiTags('client invoices')
@ApiBearerAuth()
@Controller('client/invoices')
export class ClientInvoicesController {
  constructor(
    private readonly listInvoices: ListClientInvoicesUseCase,
    private readonly downloadInvoice: DownloadClientInvoiceUseCase,
  ) {}

  @Get()
  @Roles('client')
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListClientInvoicesQuery) {
    return this.listInvoices.execute({ actor: actorOf(user), ...query });
  }

  @Get(':id/download')
  @Roles('client', 'admin', 'superadmin')
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
