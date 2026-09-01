import { AbstractEntity, Clock } from '@shared/kernel';

export interface RefreshTokenProps {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface IssueRefreshTokenInput {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string | null;
  clock: Clock;
}

export class RefreshToken extends AbstractEntity<string> {
  private props: RefreshTokenProps;

  private constructor(id: string, props: RefreshTokenProps) {
    super(id);
    this.props = props;
  }

  static issue(input: IssueRefreshTokenInput): RefreshToken {
    return new RefreshToken(input.id, {
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
      userAgent: input.userAgent ?? null,
      createdAt: input.clock.now(),
    });
  }

  static reconstitute(id: string, props: RefreshTokenProps): RefreshToken {
    return new RefreshToken(id, { ...props });
  }

  get userId(): string {
    return this.props.userId;
  }
  get tokenHash(): string {
    return this.props.tokenHash;
  }
  get expiresAt(): Date {
    return this.props.expiresAt;
  }
  get revokedAt(): Date | null {
    return this.props.revokedAt;
  }
  get userAgent(): string | null {
    return this.props.userAgent;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  isExpired(clock: Clock): boolean {
    return clock.now().getTime() >= this.props.expiresAt.getTime();
  }

  isRevoked(): boolean {
    return this.props.revokedAt !== null;
  }

  isActive(clock: Clock): boolean {
    return !this.isRevoked() && !this.isExpired(clock);
  }

  revoke(clock: Clock): void {
    if (this.props.revokedAt) return;
    this.props.revokedAt = clock.now();
  }
}
