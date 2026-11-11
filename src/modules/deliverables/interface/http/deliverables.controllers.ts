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
  Type,
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
  DownloadDeliverableUseCase,
  GetDeliverableUseCase,
  ListDeliverablesUseCase,
  UploadDeliverableUseCase,
  ValidateDeliverableAsAdminUseCase,
  ValidateDeliverableAsClientUseCase,
} from '../../application';
import { ListDeliverablesQuery, UploadDeliverableRequest } from './dto/deliverable.request';

/** `GET /deliverables` — one list for every audience, filtered in the use case. */
@ApiTags('deliverables')
@ApiBearerAuth()
@Controller('deliverables')
@Roles('client', 'consultant', 'admin', 'superadmin')
export class DeliverablesController {
  constructor(private readonly listDeliverables: ListDeliverablesUseCase) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListDeliverablesQuery) {
    return this.listDeliverables.execute({ actor: actorOf(user), ...query });
  }
}

/** GET one + download under each audience prefix; visibility enforced in the use cases. */
const createReadController = (prefix: string, roles: string[], tag: string): Type<unknown> => {
  @ApiTags(tag)
  @ApiBearerAuth()
  @Controller(prefix)
  @Roles(...roles)
  class DeliverableReadController {
    constructor(
      readonly getDeliverable: GetDeliverableUseCase,
      readonly downloadDeliverable: DownloadDeliverableUseCase,
    ) {}

    @Get(':id')
    get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
      return this.getDeliverable.execute({ actor: actorOf(user), deliverableId: id });
    }

    @Get(':id/download')
    async download(
      @CurrentUser() user: AuthenticatedUser,
      @Param('id', new ParseUUIDPipe()) id: string,
      @Res({ passthrough: true }) res: Response,
    ) {
      return sendFile(
        res,
        await this.downloadDeliverable.execute({ actor: actorOf(user), deliverableId: id }),
      );
    }
  }
  return DeliverableReadController;
};

export const ConsultantDeliverablesReadController = createReadController(
  'consultant/deliverables',
  ['consultant'],
  'deliverables (consultant)',
);
export const ClientDeliverablesReadController = createReadController(
  'client/deliverables',
  ['client'],
  'deliverables (client)',
);
export const AdminDeliverablesReadController = createReadController(
  'admin/deliverables',
  ['admin', 'superadmin'],
  'deliverables (admin)',
);

@ApiTags('deliverables (consultant)')
@ApiBearerAuth()
@Controller('consultant/deliverables')
@Roles('consultant')
export class ConsultantDeliverablesController {
  constructor(private readonly uploadDeliverable: UploadDeliverableUseCase) {}

  @Post()
  @HttpCode(201)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadDeliverableRequest })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: UploadDeliverableRequest,
  ) {
    return this.uploadDeliverable.execute({
      actor: actorOf(user),
      missionId: body.missionId,
      file: toIncomingFile(file),
    });
  }
}

@ApiTags('deliverables (client)')
@ApiBearerAuth()
@Controller('client/deliverables')
@Roles('client')
export class ClientDeliverablesController {
  constructor(private readonly validate: ValidateDeliverableAsClientUseCase) {}

  @Patch(':id/validate')
  validateAsClient(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.validate.execute({ actor: actorOf(user), deliverableId: id });
  }
}

@ApiTags('deliverables (admin)')
@ApiBearerAuth()
@Controller('admin/deliverables')
@Roles('admin', 'superadmin')
export class AdminDeliverablesController {
  constructor(private readonly validate: ValidateDeliverableAsAdminUseCase) {}

  @Patch(':id/validate')
  @RequirePermissions('validate-deliverables')
  validateAsAdmin(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.validate.execute({ actor: actorOf(user), deliverableId: id });
  }
}
