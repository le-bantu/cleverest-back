import { missionsTestContext, NOW } from '../testing/in-memory';
import { MissionsFacade } from './missions.facade';
import { MissionStatus } from '../domain';

const file = { key: 'm/contrat.docx', originalName: 'contrat.docx', mimeType: null, size: 3 };

describe('MissionsFacade.prepareMission', () => {
  it('opens a mission on the contract; written on persist, audited + client notified on finalize', async () => {
    const ctx = missionsTestContext();
    const facade = new MissionsFacade(ctx.missions, ctx.committer);
    const prepared = facade.prepareMission(
      {
        contract: { id: 'k1', quoteId: 'q1', clientId: 'client-9' },
        title: 'Audit',
        description: 'desc',
        deliveryDate: null,
        contractFile: file,
        adminId: 'admin-1',
      },
      NOW,
    );
    expect(ctx.missions.store.size).toBe(0);
    await prepared.persist({ tx: true });
    expect(ctx.missions.store.get(prepared.missionId)).toMatchObject({
      contractId: 'k1',
      quoteId: 'q1',
      clientId: 'client-9',
      status: MissionStatus.EN_ATTENTE,
    });
    expect(ctx.audit.entries).toEqual([]);
    await prepared.finalize();
    expect(ctx.audit.entries).toEqual([expect.objectContaining({ action: 'CREATED' })]);
    expect(ctx.notifier.recipients()).toEqual(['client-9']);
  });

  it('refuses a wrong mission contract type', () => {
    const ctx = missionsTestContext();
    const facade = new MissionsFacade(ctx.missions, ctx.committer);
    expect(() =>
      facade.prepareMission(
        {
          contract: { id: 'k1', quoteId: 'q1', clientId: 'c' },
          title: 'Audit',
          contractFile: { ...file, originalName: 'x.exe' },
          adminId: 'a',
        },
        NOW,
      ),
    ).toThrow(expect.objectContaining({ code: 'FILE_TYPE_NOT_ALLOWED' }));
  });
});
