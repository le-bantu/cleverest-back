import { actors, incomingFile } from '@shared/testing/fakes';
import {
  aConsultantContract,
  aSubquoteForContract,
  contractsTestContext,
  NOW,
} from '../../testing/in-memory';
import {
  CreateConsultantContractUseCase,
  DeleteConsultantContractUseCase,
  DownloadConsultantContractUseCase,
  GetConsultantContractUseCase,
  ListConsultantContractsUseCase,
  SignConsultantContractUseCase,
} from './consultant-contracts.use-cases';
import { ContractsFacade } from '../contracts.facade';

const manager = () => actors.admin(['manage-quotes']);

describe('CreateConsultantContractUseCase', () => {
  const setup = () => {
    const ctx = contractsTestContext();
    const uc = new CreateConsultantContractUseCase(
      ctx.consultantContracts,
      ctx.quotes,
      ctx.storage,
      ctx.consultantCommitter,
      ctx.clock,
    );
    return { ctx, uc };
  };

  it('stores the PDF, saves the contract at the subquote price, audits and notifies the consultant', async () => {
    const { ctx, uc } = setup();
    const sub = ctx.quotes.add(aSubquoteForContract());
    const view = await uc.execute({
      actor: manager(),
      quoteId: sub.id,
      consultantId: 'c1',
      file: incomingFile('Engagement.PDF'),
    });
    expect(view).toMatchObject({
      quoteId: sub.id,
      rootQuoteId: 'main-1',
      consultantId: 'c1',
      amount: 1200,
      signed: false,
      originalFileName: 'Engagement.PDF',
      signedFileName: null,
      createdAt: NOW,
    });
    expect([...ctx.storage.files.keys()]).toEqual([`consultant-contracts/${view.id}/original.pdf`]);
    expect(ctx.audit.entries).toEqual([
      expect.objectContaining({
        entity: 'ConsultantContract',
        action: 'CREATED',
        toStatus: 'UNSIGNED',
        metadata: { quoteId: sub.id, consultantId: 'c1', amount: 1200 },
      }),
    ]);
    expect(ctx.bus.names()).toEqual(['contracts.consultant-contract-created']);
    expect(ctx.notifier.recipients()).toEqual(['c1']);
  });

  it('duplicate (409), unknown quote (404), failing save cleans the stored file', async () => {
    const { ctx, uc } = setup();
    const sub = ctx.quotes.add(aSubquoteForContract());
    const input = { actor: manager(), quoteId: sub.id, consultantId: 'c1', file: incomingFile() };
    await uc.execute(input);
    await expect(uc.execute(input)).rejects.toMatchObject({
      code: 'CONSULTANT_CONTRACT_ALREADY_EXISTS',
      httpStatus: 409,
    });
    await expect(uc.execute({ ...input, quoteId: 'nope' })).rejects.toMatchObject({
      code: 'QUOTE_NOT_FOUND',
      httpStatus: 404,
    });
    const other = ctx.quotes.add(aSubquoteForContract());
    ctx.consultantContracts.failNextSave = true;
    await expect(uc.execute({ ...input, quoteId: other.id })).rejects.toThrow('db down');
    expect(ctx.storage.files.size).toBe(1);
  });

  it('requires an admin holding manage-quotes', async () => {
    const { ctx, uc } = setup();
    const sub = ctx.quotes.add(aSubquoteForContract());
    for (const actor of [actors.admin([]), actors.consultant('c1'), actors.client('client-1')]) {
      await expect(
        uc.execute({ actor, quoteId: sub.id, consultantId: 'c1', file: incomingFile() }),
      ).rejects.toMatchObject({ httpStatus: 403 });
    }
  });
});

describe('SignConsultantContractUseCase', () => {
  const setup = () => {
    const ctx = contractsTestContext();
    const uc = new SignConsultantContractUseCase(
      ctx.consultantContracts,
      ctx.storage,
      ctx.consultantCommitter,
      ctx.clock,
    );
    const contract = aConsultantContract();
    ctx.consultantContracts.store.set(contract.id, contract);
    return { ctx, uc, contract };
  };

  it('the bound consultant uploads the signed PDF; the issuing admin is notified', async () => {
    const { ctx, uc, contract } = setup();
    const view = await uc.execute({
      actor: actors.consultant('c1'),
      contractId: contract.id,
      file: incomingFile('signe.pdf'),
    });
    expect(view).toMatchObject({ signed: true, signedAt: NOW, signedFileName: 'signe.pdf' });
    expect(ctx.storage.files.has(`consultant-contracts/${contract.id}/signed.pdf`)).toBe(true);
    expect(ctx.audit.entries).toEqual([
      expect.objectContaining({
        action: 'STATUS_CHANGED',
        fromStatus: 'UNSIGNED',
        toStatus: 'SIGNED',
      }),
    ]);
    expect(ctx.bus.names()).toEqual(['contracts.consultant-contract-signed']);
    expect(ctx.notifier.recipients()).toEqual(['admin-1']);
  });

  it('nobody is notified when the issuing admin is unknown', async () => {
    const { ctx, uc } = setup();
    const { ConsultantContract } = await import('../../domain');
    const base = aConsultantContract();
    const orphan = ConsultantContract.rehydrate({
      id: 'orphan',
      quoteId: base.quoteId,
      rootQuoteId: base.rootQuoteId,
      consultantId: 'c1',
      amount: 1,
      createdById: null,
      originalFile: base.originalFile,
      signedFile: null,
      signedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    ctx.consultantContracts.store.set(orphan.id, orphan);
    await uc.execute({
      actor: actors.consultant('c1'),
      contractId: 'orphan',
      file: incomingFile(),
    });
    expect(ctx.notifier.sent).toEqual([]);
  });

  it('another consultant / unknown id → 404; already signed → 409; client → 403', async () => {
    const { uc, contract } = setup();
    await expect(
      uc.execute({ actor: actors.consultant('c2'), contractId: contract.id, file: incomingFile() }),
    ).rejects.toMatchObject({ code: 'CONSULTANT_CONTRACT_NOT_FOUND', httpStatus: 404 });
    await expect(
      uc.execute({ actor: actors.consultant('c1'), contractId: 'nope', file: incomingFile() }),
    ).rejects.toMatchObject({ httpStatus: 404 });
    await uc.execute({
      actor: actors.consultant('c1'),
      contractId: contract.id,
      file: incomingFile(),
    });
    await expect(
      uc.execute({ actor: actors.consultant('c1'), contractId: contract.id, file: incomingFile() }),
    ).rejects.toMatchObject({ code: 'CONSULTANT_CONTRACT_ALREADY_SIGNED', httpStatus: 409 });
    await expect(
      uc.execute({
        actor: actors.client('client-1'),
        contractId: contract.id,
        file: incomingFile(),
      }),
    ).rejects.toMatchObject({ httpStatus: 403 });
  });
});

describe('List / Get / Download / Delete consultant contracts', () => {
  const setup = () => {
    const ctx = contractsTestContext();
    const mine = aConsultantContract({ consultantId: 'c1', signed: true });
    const other = aConsultantContract({ consultantId: 'c2' });
    for (const c of [mine, other]) ctx.consultantContracts.store.set(c.id, c);
    ctx.storage.files.set(mine.originalFile.key, Buffer.from('original'));
    ctx.storage.files.set(mine.signedFile!.key, Buffer.from('signed'));
    return { ctx, mine, other };
  };

  it('list: a consultant sees only theirs, an admin filters freely', async () => {
    const { ctx, mine, other } = setup();
    const uc = new ListConsultantContractsUseCase(ctx.consultantContracts);
    const own = await uc.execute({ actor: actors.consultant('c1'), consultantId: 'c2' });
    expect(own.data.map((c) => c.id)).toEqual([mine.id]);
    const all = await uc.execute({ actor: actors.admin() });
    expect(all.meta.total).toBe(2);
    const unsigned = await uc.execute({ actor: actors.admin(), signed: false });
    expect(unsigned.data.map((c) => c.id)).toEqual([other.id]);
    const byRoot = await uc.execute({ actor: actors.admin(), rootQuoteId: 'main-1' });
    expect(byRoot.meta.total).toBe(2);
    await expect(uc.execute({ actor: actors.client('client-1') })).rejects.toMatchObject({
      httpStatus: 403,
    });
  });

  it('get: bound consultant or admin; anyone else 404', async () => {
    const { ctx, mine } = setup();
    const uc = new GetConsultantContractUseCase(ctx.consultantContracts);
    expect((await uc.execute({ actor: actors.consultant('c1'), contractId: mine.id })).id).toBe(
      mine.id,
    );
    expect((await uc.execute({ actor: actors.admin(), contractId: mine.id })).amount).toBe(1200);
    await expect(
      uc.execute({ actor: actors.consultant('c2'), contractId: mine.id }),
    ).rejects.toMatchObject({ code: 'CONSULTANT_CONTRACT_NOT_FOUND', httpStatus: 404 });
  });

  it('download: original / signed; signed missing → 404', async () => {
    const { ctx, mine, other } = setup();
    const uc = new DownloadConsultantContractUseCase(ctx.consultantContracts, ctx.storage);
    const original = await uc.execute({
      actor: actors.consultant('c1'),
      contractId: mine.id,
      version: 'original',
    });
    expect(original.content.toString()).toBe('original');
    const signed = await uc.execute({
      actor: actors.admin(),
      contractId: mine.id,
      version: 'signed',
    });
    expect(signed.content.toString()).toBe('signed');
    await expect(
      uc.execute({ actor: actors.admin(), contractId: other.id, version: 'signed' }),
    ).rejects.toMatchObject({ code: 'SIGNED_CONTRACT_NOT_FOUND', httpStatus: 404 });
  });

  it('delete: unsigned only, by a manager; audited and file removed', async () => {
    const { ctx, mine, other } = setup();
    ctx.storage.files.set(other.originalFile.key, Buffer.from('x'));
    const uc = new DeleteConsultantContractUseCase(
      ctx.consultantContracts,
      ctx.storage,
      ctx.consultantCommitter,
    );
    await expect(uc.execute({ actor: manager(), contractId: mine.id })).rejects.toMatchObject({
      code: 'CONSULTANT_CONTRACT_ALREADY_SIGNED',
      httpStatus: 409,
    });
    await expect(uc.execute({ actor: manager(), contractId: 'nope' })).rejects.toMatchObject({
      httpStatus: 404,
    });
    await expect(
      uc.execute({ actor: actors.admin([]), contractId: other.id }),
    ).rejects.toMatchObject({ httpStatus: 403 });
    await uc.execute({ actor: manager(), contractId: other.id });
    expect(ctx.consultantContracts.store.has(other.id)).toBe(false);
    expect(ctx.storage.files.has(other.originalFile.key)).toBe(false);
    expect(ctx.audit.entries).toEqual([
      expect.objectContaining({
        entity: 'ConsultantContract',
        action: 'DELETED',
        entityId: other.id,
      }),
    ]);
  });

  it('the facade tells whether a consultant is engaged on a main quote', async () => {
    const { ctx } = setup();
    const facade = new ContractsFacade(ctx.contracts, ctx.consultantContracts);
    expect(await facade.hasSignedConsultantContract('c1', 'main-1')).toBe(true);
    expect(await facade.hasSignedConsultantContract('c2', 'main-1')).toBe(false); // unsigned
    expect(await facade.hasSignedConsultantContract('c1', 'other-main')).toBe(false);
    expect(await facade.signedConsultantAmount('c1', 'main-1')).toBe(1200);
    expect(await facade.signedConsultantAmount('c2', 'main-1')).toBeNull();
  });
});
