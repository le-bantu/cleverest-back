import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '@shared/interface/http/decorators/roles.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '@shared/interface/http/decorators/current-user.decorator';
import {
  GetQuoteUseCase,
  ListConsultantQuotesUseCase,
  SubmitConsultantQuoteUseCase,
} from '../../application';
import { ListConsultantQuotesQuery, SubmitConsultantQuoteRequest } from './dto/quote.request';
import { actorOf } from './actor';

@ApiTags('quotes (consultant)')
@ApiBearerAuth()
@Controller('consultant/quotes')
@Roles('consultant')
export class QuotesConsultantController {
  constructor(
    private readonly listQuotes: ListConsultantQuotesUseCase,
    private readonly getQuote: GetQuoteUseCase,
    private readonly submitQuote: SubmitConsultantQuoteUseCase,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListConsultantQuotesQuery) {
    return this.listQuotes.execute({ actor: actorOf(user), ...query });
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.getQuote.execute({ actor: actorOf(user), quoteId: id });
  }

  @Patch(':id/submit')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SubmitConsultantQuoteRequest,
  ) {
    return this.submitQuote.execute({ actor: actorOf(user), quoteId: id, ...body });
  }
}
