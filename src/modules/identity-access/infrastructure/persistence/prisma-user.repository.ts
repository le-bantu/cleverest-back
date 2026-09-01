import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { generateUuid, normalizePageQuery, Page, PageQuery } from '@shared/kernel';
import { PrismaService } from '@shared/infrastructure/database/prisma.service';
import { User, UserRepository, UserListFilter } from '../../domain';
import { userInclude, userToDomain, profileToPersistence } from './user.mapper';

type Tx = Prisma.TransactionClient;

@Injectable()
export class PrismaUserRepository extends UserRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  nextIdentity(): string {
    return generateUuid();
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id }, include: userInclude });
    return row ? userToDomain(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase() },
      include: userInclude,
    });
    return row ? userToDomain(row) : null;
  }

  async existsByEmail(email: string): Promise<boolean> {
    const count = await this.prisma.user.count({ where: { email: email.toLowerCase() } });
    return count > 0;
  }

  async save(user: User): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.upsert({
        where: { id: user.id },
        create: {
          id: user.id,
          email: user.emailValue,
          phone: user.phone,
          passwordHash: user.passwordHash,
          isActive: user.isActive,
          twoFactorEnabled: user.twoFactorEnabled,
          emailVerifiedAt: user.emailVerifiedAt,
          deletedAt: user.deletedAt,
        },
        update: {
          email: user.emailValue,
          phone: user.phone,
          passwordHash: user.passwordHash,
          isActive: user.isActive,
          twoFactorEnabled: user.twoFactorEnabled,
          emailVerifiedAt: user.emailVerifiedAt,
          deletedAt: user.deletedAt,
        },
      });

      await this.syncRoles(tx, user);
      await this.syncPermissions(tx, user);
      await this.syncProfile(tx, user);
    });
  }

  private async syncRoles(tx: Tx, user: User): Promise<void> {
    const roles = await tx.role.findMany({ where: { name: { in: user.roles } } });
    const roleIds = new Set(roles.map((r) => r.id));
    await tx.userRole.deleteMany({
      where: { userId: user.id, roleId: { notIn: [...roleIds] } },
    });
    for (const roleId of roleIds) {
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId } },
        create: { userId: user.id, roleId },
        update: {},
      });
    }
  }

  private async syncPermissions(tx: Tx, user: User): Promise<void> {
    const names = user.directPermissions;
    const perms = names.length
      ? await tx.permission.findMany({ where: { name: { in: names } } })
      : [];
    const permIds = new Set(perms.map((p) => p.id));
    await tx.userPermission.deleteMany({
      where: { userId: user.id, permissionId: { notIn: [...permIds] } },
    });
    for (const permissionId of permIds) {
      await tx.userPermission.upsert({
        where: { userId_permissionId: { userId: user.id, permissionId } },
        create: { userId: user.id, permissionId },
        update: {},
      });
    }
  }

  private async syncProfile(tx: Tx, user: User): Promise<void> {
    const mapped = profileToPersistence(user);
    if (!mapped) return;
    const { table, data } = mapped;
    const delegate = tx[table] as {
      upsert: (args: unknown) => Promise<unknown>;
    };
    await delegate.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: { ...data },
    });
  }

  async list(query: PageQuery, filter: UserListFilter): Promise<Page<User>> {
    const { page, perPage } = normalizePageQuery(query);
    const where = this.buildWhere(filter);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: userInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return new Page(rows.map(userToDomain), total, { page, perPage });
  }

  async listAll(filter: UserListFilter): Promise<User[]> {
    const rows = await this.prisma.user.findMany({
      where: this.buildWhere(filter),
      include: userInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(userToDomain);
  }

  private buildWhere(filter: UserListFilter): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {};
    if (!filter.includeDeleted) where.deletedAt = null;
    if (filter.role) where.roles = { some: { role: { name: filter.role } } };
    if (filter.search) where.email = { contains: filter.search, mode: 'insensitive' };
    if (filter.expertise) {
      where.consultantProfile = { expertiseDomains: { has: filter.expertise } };
    }
    return where;
  }
}
