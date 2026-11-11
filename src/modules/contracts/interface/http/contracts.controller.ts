import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import {
  AuthenticatedUser,
  CurrentUser,
} from '@shared/interface/http/decorators/current-user.decorator';
import { actorOf, sendFile, toIncomingFile } from '@shared/interface/http/http-helpers';
import {
  DownloadContractUseCase,
  GetContractUseCase,
  ListContractsUseCase,
  SignContractUseCase,
} from '../../application';
import { ContractFileVersion } from '../../application/contracts.dto';
import { ListContractsQuery, SignContractRequest } from './dto/contract.request';

/** `/contracts` — the client's contracts (GET/downloads also open to admins). */
@ApiTags('contracts')
@ApiBearerAuth()
@Controller('contracts')
export class ContractsController {
  constructor(
    private readonly listContracts: ListContractsUseCase,
    private readonly getContract: GetContractUseCase,
    private readonly signContract: SignContractUseCase,
    private readonly downloadContract: DownloadContractUseCase,
  ) {}

  @Get()
  @Roles('client')
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListContractsQuery) {
    return this.listContracts.execute({ actor: actorOf(user), ...query });
  }

  @Get(':id')
  @Roles('client', 'admin', 'superadmin')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.getContract.execute({ actor: actorOf(user), contractId: id });
  }

  /** The single signature path: upload the signed PDF. */
  @Patch(':id')
  @Roles('client')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: SignContractRequest })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
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

  @Get(':id/download-original')
  @Roles('client', 'admin', 'superadmin')
  original(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.download(user, id, 'original', res);
  }

  @Get(':id/download-signed')
  @Roles('client', 'admin', 'superadmin')
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
