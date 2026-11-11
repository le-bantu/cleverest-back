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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '@shared/interface/http/decorators/roles.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '@shared/interface/http/decorators/current-user.decorator';
import {
  CreateQuoteUseCase,
  DeleteQuoteUseCase,
  GetQuoteUseCase,
  ListMyQuotesUseCase,
  SignOrRejectQuoteUseCase,
} from '../../application';
import { CreateQuoteRequest, ListMyQuotesQuery, SignQuoteRequest } from './dto/quote.request';
import { actorOf } from './actor';

@ApiTags('quotes (client)')
@ApiBearerAuth()
@Controller('quotes')
@Roles('client')
export class QuotesClientController {
  constructor(
    private readonly createQuote: CreateQuoteUseCase,
    private readonly listMyQuotes: ListMyQuotesUseCase,
    private readonly getQuote: GetQuoteUseCase,
    private readonly signOrReject: SignOrRejectQuoteUseCase,
    private readonly deleteQuote: DeleteQuoteUseCase,
  ) {}

  @Post()
  @HttpCode(201)
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateQuoteRequest) {
    return this.createQuote.execute({ actor: actorOf(user), ...body });
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListMyQuotesQuery) {
    return this.listMyQuotes.execute({ actor: actorOf(user), ...query });
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.getQuote.execute({ actor: actorOf(user), quoteId: id });
  }

  @Patch(':id/sign')
  sign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SignQuoteRequest,
  ) {
    return this.signOrReject.execute({ actor: actorOf(user), quoteId: id, ...body });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.deleteQuote.execute({ actor: actorOf(user), quoteId: id });
  }
}
