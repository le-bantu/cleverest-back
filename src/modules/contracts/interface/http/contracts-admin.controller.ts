import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
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
  CreateContractUseCase,
  DownloadContractUseCase,
  GetContractUseCase,
  ListContractsUseCase,
} from '../../application';
import { CreateContractRequest, ListContractsQuery } from './dto/contract.request';

@ApiTags('contracts (admin)')
@ApiBearerAuth()
@Controller('admin/contracts')
@Roles('admin', 'superadmin')
export class ContractsAdminController {
  constructor(
    private readonly createContract: CreateContractUseCase,
    private readonly listContracts: ListContractsUseCase,
    private readonly getContract: GetContractUseCase,
    private readonly downloadContract: DownloadContractUseCase,
  ) {}

  @Post()
  @HttpCode(201)
  @RequirePermissions('manage-quotes')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateContractRequest })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  create(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: CreateContractRequest,
  ) {
    return this.createContract.execute({
      actor: actorOf(user),
      quoteId: body.quoteId,
      file: toIncomingFile(file),
    });
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListContractsQuery) {
    return this.listContracts.execute({ actor: actorOf(user), ...query });
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.getContract.execute({ actor: actorOf(user), contractId: id });
  }

  @Get(':id/download-original')
  async original(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.downloadContract.execute({
      actor: actorOf(user),
      contractId: id,
      version: 'original',
    });
    return sendFile(res, file);
  }

  @Get(':id/download-signed')
  async signed(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.downloadContract.execute({
      actor: actorOf(user),
      contractId: id,
      version: 'signed',
    });
    return sendFile(res, file);
  }
}
