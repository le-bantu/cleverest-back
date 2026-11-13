import { actors, incomingFile } from '@shared/testing/fakes';
import { aContract, contractsTestContext, NOW } from '../../testing/in-memory';
import { CreateContractUseCase } from './create-contract.use-case';
import { SignContractUseCase } from './sign-contract.use-case';
import { ListContractsUseCase } from './list-contracts.use-case';
import { GetContractUseCase } from './get-contract.use-case';
import { DownloadContractUseCase } from './download-contract.use-case';
import { ContractsFacade } from '../contracts.facade';

const manager = () => actors.admin(['manage-quotes']);

describe('CreateContractUseCase', () => {
  const setup = () => {
    const ctx = contractsTestContext();
    const uc = new CreateContractUseCase(
      ctx.contracts,
      ctx.quotes,
      ctx.storage,
      ctx.committer,
      ctx.clock,
    );
    return { ctx, uc };
  };

  it('stores the PDF, saves the contract, audits CREATED and notifies the client', async () => {
    const { ctx, uc } = setup();
    const quote = ctx.quotes.add();
    const view = await uc.execute({
      actor: manager(),
      quoteId: quote.id,
      file: incomingFile('Contrat.PDF'),
    });
    expect(view).toMatchObject({
      quoteId: quote.id,
      clientId: 'client-1',
      signed: false,
      originalFileName: 'Contrat.PDF',
      signedFileName: null,
      createdAt: NOW,
    });
    expect([...ctx.storage.files.keys()]).toEqual([`contracts/${view.id}/original.pdf`]);
    expect(ctx.audit.entries).toEqual([
      expect.objectContaining({ entity: 'Contract', action: 'CREATED', toStatus: 'UNSIGNED' }),
    ]);
    expect(ctx.bus.names()).toEqual(['contracts.contract-created']);
    expect(ctx.notifier.recipients()).toEqual(['client-1']);
  });

  it('refuses a second contract (409) and a non-validated quote (422) without storing files', async () => {
    const { ctx, uc } = setup();
    const quote = ctx.quotes.add();
    await uc.execute({ actor: manager(), quoteId: quote.id, file: incomingFile() });
    await expect(
      uc.execute({ actor: manager(), quoteId: quote.id, file: incomingFile() }),
    ).rejects.toMatchObject({ code: 'CONTRACT_ALREADY_EXISTS', httpStatus: 409 });

    const draft = ctx.quotes.add({ status: 'COTÉ', readyForContract: false });
    await expect(
      uc.execute({ actor: manager(), quoteId: draft.id, file: incomingFile() }),
    ).rejects.toMatchObject({ code: 'QUOTE_NOT_VALIDATED' });
    expect(ctx.storage.files.size).toBe(1);
  });

  it('unknown quote → 404; storage cleaned when the save fails', async () => {
    const { ctx, uc } = setup();
    await expect(
      uc.execute({ actor: manager(), quoteId: 'nope', file: incomingFile() }),
    ).rejects.toMatchObject({ code: 'QUOTE_NOT_FOUND', httpStatus: 404 });

    const quote = ctx.quotes.add();
    ctx.contracts.failNextSave = true;
    await expect(
      uc.execute({ actor: manager(), quoteId: quote.id, file: incomingFile() }),
    ).rejects.toThrow('db down');
    expect(ctx.storage.files.size).toBe(0);
  });

  it('requires an admin holding manage-quotes', async () => {
    const { ctx, uc } = setup();
    const quote = ctx.quotes.add();
    for (const actor of [actors.admin(), actors.client(), actors.consultant()]) {
      await expect(
        uc.execute({ actor, quoteId: quote.id, file: incomingFile() }),
      ).rejects.toMatchObject({ httpStatus: 403 });
    }
  });
});

describe('SignContractUseCase', () => {
  const setup = () => {
    const ctx = contractsTestContext();
    const quote = ctx.quotes.add();
    const contract = aContract({ quote });
    ctx.contracts.store.set(contract.id, contract);
    const uc = new SignContractUseCase(
      ctx.contracts,
      ctx.quotes,
      ctx.uow,
      ctx.storage,
      ctx.committer,
      ctx.clock,
    );
    return { ctx, uc, contract, quote };
  };

  it('signs the contract and the quote in ONE unit of work, then audits and publishes', async () => {
    const { ctx, uc, contract, quote } = setup();
    const view = await uc.execute({
      actor: actors.client(),
      contractId: contract.id,
      file: incomingFile('signé.pdf'),
    });
    expect(view).toMatchObject({ signed: true, signedAt: NOW, signedFileName: 'signé.pdf' });
    expect(ctx.uow.runs).toBe(1);
    expect(ctx.contracts.saves).toEqual([{ id: contract.id, tx: ctx.uow.tx }]);
    expect(ctx.quotes.persisted).toEqual([{ quoteId: quote.id, tx: ctx.uow.tx }]);
    expect(ctx.quotes.quotes.get(quote.id)?.status).toBe('SIGNÉ_CLIENT');
    expect(ctx.quotes.finalized).toEqual([quote.id]);
    expect(ctx.storage.files.has(`contracts/${contract.id}/signed.pdf`)).toBe(true);
    expect(ctx.audit.entries).toEqual([
      expect.objectContaining({
        action: 'STATUS_CHANGED',
        fromStatus: 'UNSIGNED',
        toStatus: 'SIGNED',
      }),
    ]);
    expect(ctx.bus.names()).toEqual(['contracts.contract-signed']);
  });

  it('another client or a missing contract → 404; already signed → 409', async () => {
    const { ctx, uc, contract } = setup();
    await expect(
      uc.execute({
        actor: actors.client('client-2'),
        contractId: contract.id,
        file: incomingFile(),
      }),
    ).rejects.toMatchObject({ code: 'CONTRACT_NOT_FOUND' });
    await expect(
      uc.execute({ actor: actors.client(), contractId: 'nope', file: incomingFile() }),
    ).rejects.toMatchObject({ code: 'CONTRACT_NOT_FOUND' });

    const signed = aContract({ signed: true });
    ctx.contracts.store.set(signed.id, signed);
    await expect(
      uc.execute({ actor: actors.client(), contractId: signed.id, file: incomingFile() }),
    ).rejects.toMatchObject({ code: 'CONTRACT_ALREADY_SIGNED', httpStatus: 409 });
  });

  it('quote no longer signable → 409 and nothing written', async () => {
    const { ctx, uc, contract, quote } = setup();
    ctx.quotes.quotes.set(quote.id, { ...quote, status: 'REJETÉ', readyForContract: false });
    await expect(
      uc.execute({ actor: actors.client(), contractId: contract.id, file: incomingFile() }),
    ).rejects.toMatchObject({ httpStatus: 409 });
    expect(ctx.contracts.saves).toEqual([]);
    expect(ctx.storage.files.size).toBe(0);
  });

  it('only clients sign', async () => {
    const { uc, contract } = setup();
    await expect(
      uc.execute({ actor: actors.superadmin(), contractId: contract.id, file: incomingFile() }),
    ).rejects.toMatchObject({ code: 'ROLE_NOT_ALLOWED' });
  });
});

describe('List / Get / Download contracts', () => {
  const setup = () => {
    const ctx = contractsTestContext();
    const mine = aContract({ signed: true });
    const other = aContract({ quote: { clientId: 'client-2' } });
    ctx.contracts.store.set(mine.id, mine);
    ctx.contracts.store.set(other.id, other);
    ctx.storage.files.set(mine.originalFile.key, Buffer.from('orig'));
    ctx.storage.files.set(mine.signedFile!.key, Buffer.from('signed'));
    return { ctx, mine, other };
  };

  it('a client lists only theirs; an admin lists all with filters', async () => {
    const { ctx, mine, other } = setup();
    const uc = new ListContractsUseCase(ctx.contracts);
    expect((await uc.execute({ actor: actors.client() })).data.map((c) => c.id)).toEqual([mine.id]);
    const all = await uc.execute({ actor: actors.admin() });
    expect(all.meta.total).toBe(2);
    expect(
      (await uc.execute({ actor: actors.admin(), signed: false })).data.map((c) => c.id),
    ).toEqual([other.id]);
    expect(
      (await uc.execute({ actor: actors.admin(), quoteId: mine.quoteId })).data.map((c) => c.id),
    ).toEqual([mine.id]);
    expect(
      (
        await uc.execute({
          actor: actors.admin(),
          dateFrom: new Date('2027-01-01'),
          dateTo: new Date('2028-01-01'),
        })
      ).data,
    ).toEqual([]);
    await expect(uc.execute({ actor: actors.consultant() })).rejects.toMatchObject({
      httpStatus: 403,
    });
  });

  it('get: owner or admin; anyone else 404', async () => {
    const { ctx, mine } = setup();
    const uc = new GetContractUseCase(ctx.contracts);
    expect((await uc.execute({ actor: actors.client(), contractId: mine.id })).signed).toBe(true);
    expect((await uc.execute({ actor: actors.admin(), contractId: mine.id })).id).toBe(mine.id);
    await expect(
      uc.execute({ actor: actors.client('client-2'), contractId: mine.id }),
    ).rejects.toMatchObject({ code: 'CONTRACT_NOT_FOUND' });
  });

  it('downloads original and signed files; signed before signature → 404', async () => {
    const { ctx, mine, other } = setup();
    const uc = new DownloadContractUseCase(ctx.contracts, ctx.storage);
    const original = await uc.execute({
      actor: actors.client(),
      contractId: mine.id,
      version: 'original',
    });
    expect(original).toEqual({
      content: Buffer.from('orig'),
      fileName: 'contrat.pdf',
      mimeType: 'application/pdf',
    });
    const signed = await uc.execute({
      actor: actors.admin(),
      contractId: mine.id,
      version: 'signed',
    });
    expect(signed.content.toString()).toBe('signed');
    await expect(
      uc.execute({ actor: actors.admin(), contractId: other.id, version: 'signed' }),
    ).rejects.toMatchObject({ code: 'SIGNED_CONTRACT_NOT_FOUND' });
  });

  it('the facade exposes a summary for missions', async () => {
    const { ctx, mine } = setup();
    const facade = new ContractsFacade(ctx.contracts, ctx.consultantContracts, ctx.committer);
    expect(await facade.findSummary(mine.id)).toEqual({
      id: mine.id,
      quoteId: mine.quoteId,
      clientId: 'client-1',
      signed: true,
    });
    expect(await facade.findSummary('nope')).toBeNull();
  });
});
