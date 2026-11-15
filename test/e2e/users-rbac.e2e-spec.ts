import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../utils/http-app';
import { getTestPrisma } from '../utils/test-db';
import { seedActors, ACTOR_PASSWORD, SeededActors } from '../fixtures/actors';

const api = (app: INestApplication) => request(app.getHttpServer());

const token = async (app: INestApplication, email: string): Promise<string> => {
  const res = await api(app)
    .post('/api/auth/login')
    .send({ email, password: ACTOR_PASSWORD })
    .expect(200);
  return res.body.accessToken as string;
};

describe('users + RBAC (e2e)', () => {
  let app: INestApplication;
  let close: () => Promise<void>;
  let actors: SeededActors;

  beforeAll(async () => {
    ({ app, close } = await createTestApp());
  });
  afterAll(() => close());
  beforeEach(async () => {
    await getTestPrisma().$executeRawUnsafe(
      'TRUNCATE TABLE "users","roles","permissions","role_permissions","user_roles","user_permissions","otp_challenges","refresh_tokens","audit_logs","notifications" RESTART IDENTITY CASCADE;',
    );
    actors = await seedActors(getTestPrisma());
  });

  it('a client is forbidden from listing users (role guard)', async () => {
    await api(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${await token(app, actors.client.email)}`)
      .expect(403);
  });

  it('a bare admin is forbidden from listing users (missing manage-users permission)', async () => {
    await api(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${await token(app, actors.admin.email)}`)
      .expect(403);
  });

  it('a superadmin can CRUD a user', async () => {
    const auth = `Bearer ${await token(app, actors.superadmin.email)}`;

    const created = await api(app)
      .post('/api/users')
      .set('Authorization', auth)
      .send({
        email: 'managed@e2e.test',
        password: 'Managed123',
        roles: ['consultant'],
        profile: { expertiseDomains: ['tax'] },
      })
      .expect(201);
    const userId = created.body.userId as string;

    const list = await api(app).get('/api/users?perPage=50').set('Authorization', auth).expect(200);
    expect(list.body.meta.total).toBeGreaterThanOrEqual(5);

    const got = await api(app).get(`/api/users/${userId}`).set('Authorization', auth).expect(200);
    expect(got.body).toMatchObject({ email: 'managed@e2e.test', roles: ['consultant'] });

    await api(app)
      .put(`/api/users/${userId}`)
      .set('Authorization', auth)
      .send({ phone: '+33111111111', roles: ['client'] })
      .expect(200)
      .expect((r) => expect(r.body).toMatchObject({ phone: '+33111111111', roles: ['client'] }));

    await api(app).delete(`/api/users/${userId}`).set('Authorization', auth).expect(204);
    await api(app).get(`/api/users/${userId}`).set('Authorization', auth).expect(404);
  });

  it('a bare admin cannot create a user (missing create-user), superadmin can', async () => {
    await api(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${await token(app, actors.admin.email)}`)
      .send({ email: 'x@e2e.test', password: 'Managed123', roles: ['client'] })
      .expect(403);
  });

  it('admin != superadmin: view-statistics gates the dashboard route', async () => {
    await api(app)
      .get('/api/admin/dashboard/summary')
      .set('Authorization', `Bearer ${await token(app, actors.admin.email)}`)
      .expect(403);

    await api(app)
      .get('/api/admin/dashboard/summary')
      .set('Authorization', `Bearer ${await token(app, actors.superadmin.email)}`)
      .expect(200)
      .expect((r) => expect(r.body).toHaveProperty('generatedAt'));
  });

  it('a user can update their own profile via PUT /me but not someone else via PUT /users/:id', async () => {
    const clientAuth = `Bearer ${await token(app, actors.client.email)}`;
    await api(app)
      .put('/api/me')
      .set('Authorization', clientAuth)
      .send({ phone: '+33202020202' })
      .expect(200)
      .expect((r) => expect(r.body.phone).toBe('+33202020202'));

    await api(app)
      .put(`/api/users/${actors.consultant.id}`)
      .set('Authorization', clientAuth)
      .send({ phone: '+33000000000' })
      .expect(403);
  });

  it('deactivating my own account blocks subsequent logins', async () => {
    const clientAuth = `Bearer ${await token(app, actors.client.email)}`;
    await api(app).patch('/api/me/deactivate').set('Authorization', clientAuth).expect(204);
    await api(app)
      .post('/api/auth/login')
      .send({ email: actors.client.email, password: ACTOR_PASSWORD })
      .expect(401);
  });
});
