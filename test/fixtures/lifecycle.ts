import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getTestPrisma } from '../utils/test-db';
import { ACTOR_PASSWORD, seedActors, SeededActors } from './actors';
import { createUser, SeededUser } from './quotes';

export const PDF = (label = 'doc') => Buffer.from(`%PDF-1.4 ${label}`);

export const LIFECYCLE_TABLES = [
  'users',
  'roles',
  'permissions',
  'audit_logs',
  'notifications',
  'quotes',
  'contracts',
  'missions',
];

/**
 * Seeded actors + bearer tokens, and HTTP shortcuts that walk the business
 * lifecycle (quote → contract → mission …) the way real users do.
 */
export class LifecycleWorld {
  actors!: SeededActors;
  consultant2!: SeededUser;
  client2!: SeededUser;
  readonly auth: Record<string, string> = {};

  constructor(private readonly app: INestApplication) {}

  api() {
    return request(this.app.getHttpServer());
  }

  async reset(tables: string[] = LIFECYCLE_TABLES): Promise<void> {
    const db = getTestPrisma();
    await db.$executeRawUnsafe(
      `TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(',')} RESTART IDENTITY CASCADE;`,
    );
    this.actors = await seedActors(db);
    const hash = (await db.user.findUniqueOrThrow({ where: { id: this.actors.client.id } }))
      .passwordHash;
    this.consultant2 = await createUser(db, 'consultant2@e2e.test', 'consultant', {
      firstName: 'Fiona',
      lastName: 'Fisc',
    });
    this.client2 = await createUser(db, 'client2@e2e.test', 'client');
    for (const u of [this.consultant2, this.client2]) {
      await db.user.update({ where: { id: u.id }, data: { passwordHash: hash } });
    }
    this.auth.client = await this.login(this.actors.client.email);
    this.auth.client2 = await this.login(this.client2.email);
    this.auth.consultant = await this.login(this.actors.consultant.email);
    this.auth.consultant2 = await this.login(this.consultant2.email);
    this.auth.superadmin = await this.login(this.actors.superadmin.email);
    this.auth.admin = await this.login(this.actors.admin.email);
  }

  async login(email: string): Promise<string> {
    const res = await this.api()
      .post('/api/auth/login')
      .send({ email, password: ACTOR_PASSWORD })
      .expect(200);
    return `Bearer ${res.body.accessToken as string}`;
  }

  /** Client creates → superadmin assigns `consultant` (lead) + `consultant2` → lead quotes → admin validates. */
  async validatedQuote(): Promise<{ id: string }> {
    const quote = await this.api()
      .post('/api/quotes')
      .set('Authorization', this.auth.client)
      .send({ type: 'CONSULTATION', title: 'Audit', description: 'Audit fiscal' })
      .expect(201);
    const id = quote.body.id as string;
    await this.api()
      .post(`/api/admin/quotes/${id}/assign-consultants`)
      .set('Authorization', this.auth.superadmin)
      .send({
        consultants: [{ id: this.actors.consultant.id, isLead: true }, { id: this.consultant2.id }],
      })
      .expect(200);
    await this.api()
      .patch(`/api/consultant/quotes/${id}/submit`)
      .set('Authorization', this.auth.consultant)
      .send({ price: 1000 })
      .expect(200);
    await this.api()
      .patch(`/api/admin/quotes/${id}/validate`)
      .set('Authorization', this.auth.superadmin)
      .send({ status: 'VALIDÉ_ADMIN' })
      .expect(200);
    return { id };
  }

  async contractFor(quoteId: string): Promise<{ id: string }> {
    const res = await this.api()
      .post('/api/admin/contracts')
      .set('Authorization', this.auth.superadmin)
      .field('quoteId', quoteId)
      .attach('file', PDF('contrat'), 'contrat.pdf')
      .expect(201);
    return { id: res.body.id as string };
  }

  async signedContract(): Promise<{ id: string; quoteId: string }> {
    const quote = await this.validatedQuote();
    const contract = await this.contractFor(quote.id);
    await this.api()
      .patch(`/api/contracts/${contract.id}`)
      .set('Authorization', this.auth.client)
      .attach('file', PDF('signé'), 'signe.pdf')
      .expect(200);
    return { id: contract.id, quoteId: quote.id };
  }

  /** Signed contract → admin opens a mission (no team yet). */
  async newMission(title = 'Audit fiscal'): Promise<{ id: string; contractId: string }> {
    const contract = await this.signedContract();
    const res = await this.api()
      .post('/api/admin/missions')
      .set('Authorization', this.auth.superadmin)
      .field('contractId', contract.id)
      .field('title', title)
      .field('deliveryDate', '2026-12-31T00:00:00.000Z')
      .attach('contractMission', Buffer.from('mission contract'), 'mission.docx')
      .expect(201);
    return { id: res.body.id as string, contractId: contract.id };
  }

  /** New mission staffed with `consultant` (lead, from the quote) + `consultant2`, accepted. */
  async activeMission(): Promise<{ id: string; contractId: string }> {
    const mission = await this.newMission();
    await this.api()
      .post(`/api/admin/missions/${mission.id}/assign`)
      .set('Authorization', this.auth.superadmin)
      .send({ consultants: [{ id: this.consultant2.id }, { id: this.actors.consultant.id }] })
      .expect(200);
    await this.api()
      .post(`/api/missions/${mission.id}/respond`)
      .set('Authorization', this.auth.consultant)
      .send({ action: 'accept' })
      .expect(200);
    return mission;
  }
}
