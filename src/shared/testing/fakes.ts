import { DomainEvent, NotFoundException } from '@shared/kernel';
import { AuditLogPort, AuditRecord } from '@shared/application/ports/audit-log.port';
import { EventBusPort, EventHandler } from '@shared/application/ports/event-bus.port';
import {
  FileStoragePort,
  PutFileInput,
  StoredFile,
} from '@shared/application/ports/file-storage.port';
import { NotificationEvent, NotifierPort } from '@shared/application/ports/notifier.port';
import { UnitOfWorkPort } from '@shared/application/ports/unit-of-work.port';
import { ActorContext } from '@shared/application/use-case';

/** Runs the work immediately with a marker transaction; counts runs. */
export class FakeUnitOfWork extends UnitOfWorkPort {
  runs = 0;
  readonly tx = { tx: true };
  run<T>(work: (tx: unknown) => Promise<T>): Promise<T> {
    this.runs++;
    return work(this.tx);
  }
}

export class FakeAuditLog extends AuditLogPort {
  readonly entries: AuditRecord[] = [];
  record(entry: AuditRecord): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

export class FakeEventBus extends EventBusPort {
  readonly published: DomainEvent[] = [];
  publish(events: DomainEvent[]): Promise<void> {
    this.published.push(...events);
    return Promise.resolve();
  }
  subscribe(_eventName: string, _handler: EventHandler): void {}
  names(): string[] {
    return this.published.map((e) => e.name);
  }
}

export class FakeNotifier extends NotifierPort {
  readonly sent: Array<{ userId: string; event: NotificationEvent }> = [];
  failFor = new Set<string>();
  notify(userId: string, event: NotificationEvent): Promise<void> {
    if (this.failFor.has(userId)) return Promise.reject(new Error('smtp down'));
    this.sent.push({ userId, event });
    return Promise.resolve();
  }
  recipients(): string[] {
    return this.sent.map((s) => s.userId);
  }
}

export class FakeFileStorage extends FileStoragePort {
  readonly files = new Map<string, Buffer>();
  put(input: PutFileInput): Promise<StoredFile> {
    this.files.set(input.key, input.content);
    return Promise.resolve({ key: input.key, size: input.content.byteLength });
  }
  get(key: string): Promise<Buffer> {
    const file = this.files.get(key);
    if (!file) return Promise.reject(new NotFoundException('FILE_NOT_FOUND', key));
    return Promise.resolve(file);
  }
  delete(key: string): Promise<void> {
    this.files.delete(key);
    return Promise.resolve();
  }
  exists(key: string): Promise<boolean> {
    return Promise.resolve(this.files.has(key));
  }
  url(key: string): Promise<string> {
    return Promise.resolve(`mem://${key}`);
  }
}

/** Authenticated actors as the interface layer would build them. */
export const actors = {
  client: (userId = 'client-1'): ActorContext => ({ userId, roles: ['client'], permissions: [] }),
  consultant: (userId = 'c1'): ActorContext => ({ userId, roles: ['consultant'], permissions: [] }),
  admin: (permissions: string[] = [], userId = 'admin-1'): ActorContext => ({
    userId,
    roles: ['admin'],
    permissions,
  }),
  superadmin: (userId = 'super-1'): ActorContext => ({
    userId,
    roles: ['superadmin'],
    permissions: [
      'manage-quotes',
      'assign-consultants',
      'validate-deliverables',
      'validate-payments',
      'pay-consultants',
      'pay-apporteurs',
    ],
  }),
  apporteur: (userId = 'app-1'): ActorContext => ({
    userId,
    roles: ['apporteur'],
    permissions: [],
  }),
};

/** A small in-memory upload. */
export const incomingFile = (originalName = 'file.pdf', content = 'pdf-bytes') => ({
  buffer: Buffer.from(content),
  originalName,
  mimeType: originalName.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream',
  size: Buffer.byteLength(content),
});
