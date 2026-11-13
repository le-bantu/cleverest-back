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
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
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
  ConvertProspectUseCase,
  CreateProspectUseCase,
  DownloadProspectDocumentUseCase,
  GetCommissionUseCase,
  GetProspectUseCase,
  ListCommissionsUseCase,
  ListProspectsUseCase,
  RejectProspectUseCase,
  SetCommissionAmountUseCase,
  UpdateCommissionStatusUseCase,
  UploadProspectDocumentUseCase,
} from '../../application';
import {
  AdminListCommissionsQuery,
  AdminListProspectsQuery,
  ConvertProspectRequest,
  CreateProspectRequest,
  ListCommissionsQuery,
  ListProspectsQuery,
  RejectProspectRequest,
  SetCommissionAmountRequest,
  UpdateCommissionStatusRequest,
} from './dto/apporteur.request';

const limits = { fileSize: MAX_UPLOAD_BYTES };

/** `/prospects` — the apporteur's leads. */
@ApiTags('prospects (apporteur)')
@ApiBearerAuth()
@Controller('prospects')
@Roles('apporteur')
export class ProspectsApporteurController {
  constructor(
    private readonly createProspect: CreateProspectUseCase,
    private readonly listProspects: ListProspectsUseCase,
    private readonly getProspect: GetProspectUseCase,
    private readonly uploadDocument: UploadProspectDocumentUseCase,
    private readonly downloadDocument: DownloadProspectDocumentUseCase,
  ) {}

  @Post()
  @HttpCode(201)
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateProspectRequest) {
    return this.createProspect.execute({ actor: actorOf(user), ...body });
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListProspectsQuery) {
    return this.listProspects.execute({ actor: actorOf(user), ...query });
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.getProspect.execute({ actor: actorOf(user), prospectId: id });
  }

  @Post(':id/upload')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(FileInterceptor('file', { limits }))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.uploadDocument.execute({
      actor: actorOf(user),
      prospectId: id,
      file: toIncomingFile(file),
    });
  }

  @Get(':id/document')
  async document(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return sendFile(
      res,
      await this.downloadDocument.execute({ actor: actorOf(user), prospectId: id }),
    );
  }
}

@ApiTags('prospects (admin)')
@ApiBearerAuth()
@Controller('admin/prospects')
@Roles('admin', 'superadmin')
export class ProspectsAdminController {
  constructor(
    private readonly listProspects: ListProspectsUseCase,
    private readonly getProspect: GetProspectUseCase,
    private readonly downloadDocument: DownloadProspectDocumentUseCase,
    private readonly convertProspect: ConvertProspectUseCase,
    private readonly rejectProspect: RejectProspectUseCase,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: AdminListProspectsQuery) {
    return this.listProspects.execute({ actor: actorOf(user), ...query });
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.getProspect.execute({ actor: actorOf(user), prospectId: id });
  }

  @Get(':id/document')
  async document(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return sendFile(
      res,
      await this.downloadDocument.execute({ actor: actorOf(user), prospectId: id }),
    );
  }

  /** One transaction: client + quote SIGNÉ_CLIENT + signed contract + mission + commission. */
  @Post(':id/convert')
  @HttpCode(201)
  @RequirePermissions('manage-users')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: ConvertProspectRequest })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'signedContract', maxCount: 1 },
        { name: 'contractMission', maxCount: 1 },
      ],
      { limits },
    ),
  )
  convert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFiles()
    files: { signedContract?: Express.Multer.File[]; contractMission?: Express.Multer.File[] },
    @Body() body: ConvertProspectRequest,
  ) {
    const { signedContract: _s, contractMission: _c, ...fields } = body;
    void _s;
    void _c;
    return this.convertProspect.execute({
      actor: actorOf(user),
      prospectId: id,
      ...fields,
      signedContract: toIncomingFile(files?.signedContract?.[0], 'signedContract'),
      contractMission: toIncomingFile(files?.contractMission?.[0], 'contractMission'),
    });
  }

  @Patch(':id/reject')
  @RequirePermissions('manage-users')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: RejectProspectRequest,
  ) {
    return this.rejectProspect.execute({
      actor: actorOf(user),
      prospectId: id,
      reason: body.reason,
    });
  }
}

/** `/commissions` — the apporteur's commissions (GET one also open to admins). */
@ApiTags('commissions')
@ApiBearerAuth()
@Controller('commissions')
export class CommissionsApporteurController {
  constructor(
    private readonly listCommissions: ListCommissionsUseCase,
    private readonly getCommission: GetCommissionUseCase,
  ) {}

  @Get()
  @Roles('apporteur')
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListCommissionsQuery) {
    return this.listCommissions.execute({ actor: actorOf(user), ...query });
  }

  @Get(':id')
  @Roles('apporteur', 'admin', 'superadmin')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.getCommission.execute({ actor: actorOf(user), commissionId: id });
  }
}

@ApiTags('commissions (admin)')
@ApiBearerAuth()
@Controller('admin/commissions')
@Roles('admin', 'superadmin')
export class CommissionsAdminController {
  constructor(
    private readonly listCommissions: ListCommissionsUseCase,
    private readonly getCommission: GetCommissionUseCase,
    private readonly updateStatus: UpdateCommissionStatusUseCase,
    private readonly setAmount: SetCommissionAmountUseCase,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: AdminListCommissionsQuery) {
    return this.listCommissions.execute({ actor: actorOf(user), ...query });
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.getCommission.execute({ actor: actorOf(user), commissionId: id });
  }

  @Patch(':id/status')
  @RequirePermissions('pay-apporteurs')
  status(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateCommissionStatusRequest,
  ) {
    return this.updateStatus.execute({
      actor: actorOf(user),
      commissionId: id,
      status: body.status,
    });
  }

  @Patch(':id')
  @RequirePermissions('pay-apporteurs')
  amount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SetCommissionAmountRequest,
  ) {
    return this.setAmount.execute({ actor: actorOf(user), commissionId: id, amount: body.amount });
  }
}
