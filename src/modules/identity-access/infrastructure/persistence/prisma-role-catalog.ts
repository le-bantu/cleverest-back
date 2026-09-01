import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/infrastructure/database/prisma.service';
import { RoleCatalogPort } from '../../domain';

@Injectable()
export class PrismaRoleCatalog extends RoleCatalogPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async roleExists(name: string): Promise<boolean> {
    return (await this.prisma.role.count({ where: { name } })) > 0;
  }

  async permissionsForRoles(roleNames: string[]): Promise<string[]> {
    if (roleNames.length === 0) return [];
    const rows = await this.prisma.rolePermission.findMany({
      where: { role: { name: { in: roleNames } } },
      include: { permission: true },
    });
    return [...new Set(rows.map((r) => r.permission.name))];
  }
}
