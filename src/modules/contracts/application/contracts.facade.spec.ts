import { contractsTestContext, NOW, pdf } from '../testing/in-memory';
import { ContractsFacade } from './contracts.facade';

describe('ContractsFacade.prepareSignedContract', () => {
  it('draws up and signs the contract at once; written on persist, audited on finalize', async () => {
    const ctx = contractsTestContext();
    const facade = new ContractsFacade(ctx.contracts, ctx.consultantContracts, ctx.committer);
    const prepared = facade.prepareSignedContract(
      {
        quote: { id: 'q1', clientId: 'client-9', requestNumber: 'req-010', price: 5000 },
        signedFile: pdf('signe.pdf'),
        adminId: 'admin-1',
      },
      NOW,
    );
    expect(ctx.contracts.store.size).toBe(0);
    await prepared.persist({ tx: true });
    const c = ctx.contracts.store.get(prepared.contractId)!;
    expect(c).toMatchObject({ quoteId: 'q1', clientId: 'client-9', signed: true, signedAt: NOW });
    expect(c.originalFile).toEqual(c.signedFile);
    expect(ctx.contracts.saves).toEqual([{ id: prepared.contractId, tx: { tx: true } }]);
    await prepared.finalize();
    expect(ctx.audit.entries.map((e) => e.toStatus)).toEqual(['UNSIGNED', 'SIGNED']);
  });

  it('refuses a non-PDF signed document before anything is written', () => {
    const ctx = contractsTestContext();
    const facade = new ContractsFacade(ctx.contracts, ctx.consultantContracts, ctx.committer);
    expect(() =>
      facade.prepareSignedContract(
        {
          quote: { id: 'q1', clientId: 'c', requestNumber: 'req-1', price: 1 },
          signedFile: { ...pdf(), originalName: 'x.docx' },
          adminId: 'a',
        },
        NOW,
      ),
    ).toThrow(expect.objectContaining({ httpStatus: 422 }));
  });
});
