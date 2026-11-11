import {
  Body,
  Controller,
  Delete,
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
  CreateConsultantContractUseCase,
  DeleteConsultantContractUseCase,
  DownloadConsultantContractUseCase,
  GetConsultantContractUseCase,
  ListConsultantContractsUseCase,
  SignConsultantContractUseCase,
} from '../../application';
import { ContractFileVersion } from '../../application/contracts.dto';
import {
  AdminListConsultantContractsQuery,
  CreateConsultantContractRequest,
  ListConsultantContractsQuery,
  SignContractRequest,
} from './dto/contract.request';

const pdfUpload = () => FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } });

/** Read + download endpoints shared by the admin and consultant prefixes. */
abstract class ConsultantContractsReadBase {
  constructor(
    protected readonly getContract: GetConsultantContractUseCase,
    protected readonly downloadContract: DownloadConsultantContractUseCase,
  ) {}

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.getContract.execute({ actor: actorOf(user), contractId: id });
  }

  @Get(':id/download-original')
  original(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.download(user, id, 'original', res);
  }

  @Get(':id/download-signed')
  signed(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.download(user, id, 'signed', res);
  }

  private async download(
    user: AuthenticatedUser,
    contractId: string,
    version: ContractFileVersion,
    res: Response,
  ) {
    const file = await this.downloadContract.execute({
      actor: actorOf(user),
      contractId,
      version,
    });
    return sendFile(res, file);
  }
}

/** `/admin/consultant-contracts` — engagements Cleverest ↔ consultant. */
@ApiTags('consultant contracts (admin)')
@ApiBearerAuth()
@Controller('admin/consultant-contracts')
@Roles('admin', 'superadmin')
export class AdminConsultantContractsController extends ConsultantContractsReadBase {
  constructor(
    getContract: GetConsultantContractUseCase,
    downloadContract: DownloadConsultantContractUseCase,
    private readonly createContract: CreateConsultantContractUseCase,
    private readonly listContracts: ListConsultantContractsUseCase,
    private readonly deleteContract: DeleteConsultantContractUseCase,
  ) {
    super(getContract, downloadContract);
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions('manage-quotes')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateConsultantContractRequest })
  @UseInterceptors(pdfUpload())
  create(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: CreateConsultantContractRequest,
  ) {
    return this.createContract.execute({
      actor: actorOf(user),
      quoteId: body.quoteId,
      consultantId: body.consultantId,
      amount: body.amount,
      file: toIncomingFile(file),
    });
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: AdminListConsultantContractsQuery) {
    return this.listContracts.execute({ actor: actorOf(user), ...query });
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('manage-quotes')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.deleteContract.execute({ actor: actorOf(user), contractId: id });
  }
}

/** `/consultant/contracts` — the consultant's own engagements; signing = upload the signed PDF. */
@ApiTags('consultant contracts')
@ApiBearerAuth()
@Controller('consultant/contracts')
@Roles('consultant')
export class ConsultantContractsController extends ConsultantContractsReadBase {
  constructor(
    getContract: GetConsultantContractUseCase,
    downloadContract: DownloadConsultantContractUseCase,
    private readonly listContracts: ListConsultantContractsUseCase,
    private readonly signContract: SignConsultantContractUseCase,
  ) {
    super(getContract, downloadContract);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListConsultantContractsQuery) {
    return this.listContracts.execute({ actor: actorOf(user), ...query });
  }

  @Patch(':id')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: SignContractRequest })
  @UseInterceptors(pdfUpload())
  sign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.signContract.execute({
      actor: actorOf(user),
      contractId: id,
      file: toIncomingFile(file),
    });
  }
}
