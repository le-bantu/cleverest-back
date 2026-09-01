import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '@shared/interface/http/decorators/roles.decorator';
import { RequirePermissions } from '@shared/interface/http/decorators/require-permissions.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '@shared/interface/http/decorators/current-user.decorator';
import {
  ActorInfo,
  CreateUserUseCase,
  DeleteUserUseCase,
  GetUserUseCase,
  ListAllUsersUseCase,
  ListUsersUseCase,
  UpdateUserUseCase,
} from '../../application';
import {
  CreateUserRequest,
  ListAllUsersQuery,
  ListUsersQuery,
  UpdateUserRequest,
} from './dto/user.request';
import { UserResponse } from './dto/responses';

const actorOf = (user: AuthenticatedUser): ActorInfo => ({
  userId: user.userId,
  roles: user.roles,
  permissions: user.permissions,
});

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly listUsers: ListUsersUseCase,
    private readonly listAllUsers: ListAllUsersUseCase,
    private readonly getUser: GetUserUseCase,
    private readonly createUser: CreateUserUseCase,
    private readonly updateUser: UpdateUserUseCase,
    private readonly deleteUser: DeleteUserUseCase,
  ) {}

  @Get()
  @Roles('admin', 'superadmin')
  @RequirePermissions('manage-users')
  list(@Query() query: ListUsersQuery) {
    return this.listUsers.execute(query);
  }

  @Get('list')
  @Roles('admin', 'superadmin')
  @RequirePermissions('manage-users')
  listAll(@Query() query: ListAllUsersQuery) {
    return this.listAllUsers.execute(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: UserResponse })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.getUser.execute({ actor: actorOf(user), targetUserId: id });
  }

  @Post()
  @HttpCode(201)
  @Roles('admin', 'superadmin')
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateUserRequest) {
    return this.createUser.execute({
      actor: actorOf(user),
      email: body.email,
      password: body.password,
      roles: body.roles,
      phone: body.phone ?? null,
      profile: body.profile,
    });
  }

  @Put(':id')
  @ApiOkResponse({ type: UserResponse })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateUserRequest,
  ) {
    return this.updateUser.execute({
      actor: actorOf(user),
      targetUserId: id,
      email: body.email,
      password: body.password,
      phone: body.phone,
      roles: body.roles,
      profile: body.profile,
    });
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('admin', 'superadmin')
  @RequirePermissions('manage-users')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.deleteUser.execute({ actor: actorOf(user), targetUserId: id });
  }
}
