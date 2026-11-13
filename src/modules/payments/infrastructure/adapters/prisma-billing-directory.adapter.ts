import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/infrastructure/database/prisma.service';
import { BilledClient, BillingDirectoryPort } from '../../domain';

/** Read-only adapter onto identity-access tables (explicit port, no write). */
@Injectable()
export class PrismaBillingDirectoryAdapter extends BillingDirectoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findClient(clientId: string): Promise<BilledClient | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: clientId },
      select: { id: true, email: true, clientProfile: { select: { name: true } } },
    });
    if (!user) return null;
    return {
      clientId: user.id,
      name: user.clientProfile?.name?.trim() || user.email || user.id,
      email: user.email,
    };
  }
}
