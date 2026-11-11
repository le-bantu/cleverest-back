import { FakeNotifier } from '@shared/testing/fakes';
import { BestEffortNotifier } from './best-effort-notifier';

describe('BestEffortNotifier', () => {
  it('dedupes, skips empty ids and swallows delivery failures', async () => {
    const fake = new FakeNotifier();
    fake.failFor.add('down');
    const notifier = new BestEffortNotifier(fake);
    jest.spyOn(notifier['logger'], 'warn').mockImplementation(() => undefined);
    await notifier.notify(['a', 'a', null, undefined, 'down', 'b'], {
      type: 't',
      title: 'T',
      body: 'B',
    });
    expect(fake.recipients()).toEqual(['a', 'b']);
  });
});
