import { readBunkerPublicKey } from '../nip46-public-key';
import { Nip46TimeoutError } from '../nip46-timeout';

describe('post-approval public-key discovery', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  test('does not retry a prompt response', async () => {
    const getPublicKey = jest.fn(async () => 'user-key');
    await expect(readBunkerPublicKey({ getPublicKey })).resolves.toBe('user-key');
    await jest.advanceTimersByTimeAsync(60_000);
    expect(getPublicKey).toHaveBeenCalledTimes(1);
  });

  test('retries the ephemeral read while Amber activates its listener', async () => {
    const getPublicKey = jest.fn<Promise<string>, []>()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce('user-key');
    const pending = readBunkerPublicKey({ getPublicKey });
    await jest.advanceTimersByTimeAsync(30_000);
    await expect(pending).resolves.toBe('user-key');
    await jest.advanceTimersByTimeAsync(60_000);
    expect(getPublicKey).toHaveBeenCalledTimes(3);
  });

  test('accepts a late reply from an earlier request without waiting for the next retry', async () => {
    let reply!: (key: string) => void;
    const getPublicKey = jest.fn<Promise<string>, []>()
      .mockImplementationOnce(() => new Promise(resolve => { reply = resolve; }))
      .mockImplementation(() => new Promise(() => {}));
    const pending = readBunkerPublicKey({ getPublicKey });
    await jest.advanceTimersByTimeAsync(15_000);
    reply('delayed-key');
    await expect(pending).resolves.toBe('delayed-key');
    await jest.advanceTimersByTimeAsync(60_000);
    expect(getPublicKey).toHaveBeenCalledTimes(2);
  });

  test('does not retry a denied request', async () => {
    const getPublicKey = jest.fn(async () => { throw new Error('permission denied'); });
    await expect(readBunkerPublicKey({ getPublicKey })).rejects.toThrow('permission denied');
    await jest.advanceTimersByTimeAsync(60_000);
    expect(getPublicKey).toHaveBeenCalledTimes(1);
  });

  test('retains the total one-minute bound and observes late failures', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const rejectors: ((reason: Error) => void)[] = [];
    const getPublicKey = jest.fn(() => new Promise<string>((_, reject) => { rejectors.push(reject); }));
    const pending = expect(readBunkerPublicKey({ getPublicKey })).rejects.toBeInstanceOf(Nip46TimeoutError);
    await jest.advanceTimersByTimeAsync(60_000);
    await pending;
    rejectors.forEach(reject => reject(new Error('late relay closure')));
    await jest.advanceTimersByTimeAsync(60_000);
    expect(getPublicKey).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });
});
