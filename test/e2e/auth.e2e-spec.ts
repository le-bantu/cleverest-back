import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../utils/http-app';
import { getTestPrisma } from '../utils/test-db';
import { seedActors, ACTOR_PASSWORD } from '../fixtures/actors';
import { MailNotifierAdapter } from '../../src/shared/infrastructure/notifications/mail-notifier.adapter';

const api = (app: INestApplication) => request(app.getHttpServer());

const extractOtp = (mail: MailNotifierAdapter): string => {
  const last = mail.sent[mail.sent.length - 1];
  const match = /Code\s*:\s*(\d{6})/.exec(last?.text ?? '');
  if (!match) throw new Error(`no OTP in mail: ${last?.text}`);
  return match[1];
};

describe('auth (e2e)', () => {
  let app: INestApplication;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ app, close } = await createTestApp());
  });
  afterAll(() => close());
  beforeEach(async () => {
    await getTestPrisma().$executeRawUnsafe(
      'TRUNCATE TABLE "users","roles","permissions","role_permissions","user_roles","user_permissions","otp_challenges","refresh_tokens","audit_logs","notifications" RESTART IDENTITY CASCADE;',
    );
    await seedActors(getTestPrisma());
  });

  it('registers a client then logs in and reads /auth/me', async () => {
    await api(app)
      .post('/api/auth/register')
      .send({ email: 'newbie@e2e.test', password: 'Sup3rSecret', role: 'client' })
      .expect(201);

    const login = await api(app)
      .post('/api/auth/login')
      .send({ email: 'newbie@e2e.test', password: 'Sup3rSecret' })
      .expect(200);
    expect(login.body).toMatchObject({ otpRequired: false });
    expect(login.body.accessToken).toBeDefined();

    const me = await api(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(me.body).toMatchObject({ email: 'newbie@e2e.test', roles: ['client'] });
  });

  it('rejects self-registration as admin (blocked at the DTO boundary)', async () => {
    await api(app)
      .post('/api/auth/register')
      .send({ email: 'sneaky@e2e.test', password: 'Sup3rSecret', role: 'admin' })
      .expect(400);
  });

  it('logs in without 2FA and returns a usable token pair', async () => {
    const res = await api(app)
      .post('/api/auth/login')
      .send({ email: 'client@e2e.test', password: ACTOR_PASSWORD })
      .expect(200);
    expect(res.body.otpRequired).toBe(false);
    expect(typeof res.body.refreshToken).toBe('string');
  });

  it('performs the two-step 2FA login', async () => {
    const first = await api(app)
      .post('/api/auth/login')
      .send({ email: 'client@e2e.test', password: ACTOR_PASSWORD })
      .expect(200);
    await api(app)
      .patch('/api/me/2fa')
      .set('Authorization', `Bearer ${first.body.accessToken}`)
      .send({ enabled: true })
      .expect(200);

    const challenge = await api(app)
      .post('/api/auth/login')
      .send({ email: 'client@e2e.test', password: ACTOR_PASSWORD })
      .expect(202);
    expect(challenge.body).toMatchObject({ otpRequired: true });

    const code = extractOtp(app.get(MailNotifierAdapter));
    const verified = await api(app)
      .post('/api/auth/otp/verify')
      .send({ challengeId: challenge.body.challengeId, code })
      .expect(200);
    expect(verified.body.accessToken).toBeDefined();

    await api(app)
      .post('/api/auth/otp/verify')
      .send({ challengeId: challenge.body.challengeId, code })
      .expect(409); // already used
  });

  it('rotates the refresh token and rejects the old one', async () => {
    const login = await api(app)
      .post('/api/auth/login')
      .send({ email: 'client@e2e.test', password: ACTOR_PASSWORD })
      .expect(200);

    const refreshed = await api(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);
    expect(refreshed.body.accessToken).toBeDefined();

    await api(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
  });

  it('logout revokes the refresh token', async () => {
    const login = await api(app)
      .post('/api/auth/login')
      .send({ email: 'client@e2e.test', password: ACTOR_PASSWORD })
      .expect(200);

    await api(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ refreshToken: login.body.refreshToken })
      .expect(204);

    await api(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
  });

  it('401 on a protected route without a token', async () => {
    await api(app).get('/api/auth/me').expect(401);
    await api(app).get('/api/me').expect(401);
  });

  it('422 on an invalid login body', async () => {
    await api(app).post('/api/auth/login').send({ email: 'not-an-email' }).expect(400);
  });
});
