export const AUDIT_LOG = Symbol('AUDIT_LOG');

export interface AuditRecord {
  entity: string; // e.g. "Quote"
  entityId: string;
  action: string; // e.g. "STATUS_CHANGED"
  fromStatus?: string | null;
  toStatus?: string | null;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Append-only audit trail for status transitions on quotes / contracts / payments. */
export abstract class AuditLogPort {
  abstract record(entry: AuditRecord): Promise<void>;
}
