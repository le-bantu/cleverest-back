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
import { RequirePermissions } from '@shared/interface/http/decorators/require-permissions.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '@shared/interface/http/decorators/current-user.decorator';
import {
  AssignConsultantsUseCase,
  CreateSubquoteUseCase,
  DeleteQuoteUseCase,
  GetConsultantShortlistUseCase,
  GetQuoteUseCase,
  ListAdminQuotesUseCase,
  ListSubquotesUseCase,
  ReviewClientQuoteUseCase,
  SetAdminNotesToConsultantUseCase,
  SetDocumentVisibilityUseCase,
  SplitQuoteUseCase,
  ValidateConsultantQuoteUseCase,
} from '../../application';
import {
  AdminNotesToConsultantRequest,
  AssignConsultantsRequest,
  CreateSubquoteRequest,
  DocumentVisibilityRequest,
  ListAdminQuotesQuery,
  ReviewQuoteRequest,
  SplitQuoteRequest,
  ValidateQuoteRequest,
} from './dto/quote.request';
import { actorOf } from './actor';

const MANAGE = 'manage-quotes';
const ASSIGN = 'assign-consultants';

@ApiTags('quotes (admin)')
@ApiBearerAuth()
@Controller('admin/quotes')
@Roles('admin', 'superadmin')
export class QuotesAdminController {
  constructor(
    private readonly listQuotes: ListAdminQuotesUseCase,
    private readonly getQuote: GetQuoteUseCase,
    private readonly deleteQuote: DeleteQuoteUseCase,
    private readonly reviewQuote: ReviewClientQuoteUseCase,
    private readonly validateQuote: ValidateConsultantQuoteUseCase,
    private readonly setNotes: SetAdminNotesToConsultantUseCase,
    private readonly splitQuote: SplitQuoteUseCase,
    private readonly listSubquotes: ListSubquotesUseCase,
    private readonly createSubquote: CreateSubquoteUseCase,
    private readonly shortlist: GetConsultantShortlistUseCase,
    private readonly assignConsultants: AssignConsultantsUseCase,
    private readonly setVisibility: SetDocumentVisibilityUseCase,
  ) {}

  @Get()
  @RequirePermissions(MANAGE)
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListAdminQuotesQuery) {
    return this.listQuotes.execute({ actor: actorOf(user), ...query });
  }

  /** Declared before `:id` routes so "documents" is never parsed as a quote id. */
  @Patch('documents/:documentId/visibility')
  visibility(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Body() body: DocumentVisibilityRequest,
  ) {
    return this.setVisibility.execute({ actor: actorOf(user), documentId, ...body });
  }

  @Get(':id')
  @RequirePermissions(MANAGE)
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.getQuote.execute({ actor: actorOf(user), quoteId: id });
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(MANAGE)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.deleteQuote.execute({ actor: actorOf(user), quoteId: id });
  }

  @Patch(':id/review')
  @RequirePermissions(MANAGE)
  review(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ReviewQuoteRequest,
  ) {
    return this.reviewQuote.execute({ actor: actorOf(user), quoteId: id, ...body });
  }

  @Patch(':id/validate')
  @RequirePermissions(MANAGE)
  validate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ValidateQuoteRequest,
  ) {
    return this.validateQuote.execute({ actor: actorOf(user), quoteId: id, ...body });
  }

  @Patch(':id/admin-notes-consultant')
  @RequirePermissions(MANAGE)
  notes(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: AdminNotesToConsultantRequest,
  ) {
    return this.setNotes.execute({ actor: actorOf(user), quoteId: id, ...body });
  }

  @Post(':id/split')
  @RequirePermissions(ASSIGN)
  split(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SplitQuoteRequest,
  ) {
    return this.splitQuote.execute({ actor: actorOf(user), quoteId: id, ...body });
  }

  @Get(':id/subquotes')
  @RequirePermissions(MANAGE)
  subquotes(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.listSubquotes.execute({ actor: actorOf(user), quoteId: id });
  }

  @Post(':id/subquotes')
  @HttpCode(201)
  @RequirePermissions(ASSIGN)
  addSubquote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CreateSubquoteRequest,
  ) {
    return this.createSubquote.execute({ actor: actorOf(user), quoteId: id, ...body });
  }

  @Get(':id/shortlist')
  @RequirePermissions(ASSIGN)
  getShortlist(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.shortlist.execute({ actor: actorOf(user), quoteId: id });
  }

  @Post(':id/assign-consultants')
  @HttpCode(200)
  @RequirePermissions(ASSIGN)
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: AssignConsultantsRequest,
  ) {
    return this.assignConsultants.execute({ actor: actorOf(user), quoteId: id, ...body });
  }
}
