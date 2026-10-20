import { loginWithBunker, NIP46_DEFAULT_RELAYS } from '../nip46-connect.service';

const mockFromBunker = jest.fn();
const mockAddRemoteAccount = jest.fn(async (_opts: unknown) => ({ pubkey: 'user-pubkey' }));
let mockAppState = 'active';
let mockAppStateListener: ((state: string) => void) | null = null;

jest.mock('nostr-tools/nip46', () => ({
  ...jest.requireActual('nostr-tools/nip46'),
  BunkerSigner: {
    fromBunker: (...args: unknown[]) => mockFromBunker(...args),
  },
}));

jest.mock('@/services/account/account.service', () => ({
  addRemoteAccount: (opts: unknown) => mockAddRemoteAccount(opts),
}));

jest.mock('@/services/relay/relay-pool', () => ({
  relayPool: { underlyingPool: {} },
}));

jest.mock('@/platform', () => ({
  platform: {
    urlOpener: { openExternalUrl: jest.fn(async () => {}) },
    appState: {
      currentState: () => mockAppState,
      addChangeListener: (listener: (state: string) => void) => {
        mockAppStateListener = listener;
        return () => { mockAppStateListener = null; };
      },
    },
  },
}));

describe('loginWithBunker', () => {
  beforeEach(() => {
    mockFromBunker.mockReset();
    mockAddRemoteAccount.mockReset().mockResolvedValue({ pubkey: 'user-pubkey' });
    mockAppState = 'active';
    mockAppStateListener = null;
  });

  test('uses the secret once and persists only the authorised client session', async () => {
    const pointer = {
      pubkey: 'a'.repeat(64),
      relays: ['wss://relay.example/'],
      secret: 'one-time-secret',
    };
    const bunker = {
      bp: pointer,
      connect: jest.fn(async () => {}),
      getPublicKey: jest.fn(async () => 'user-pubkey'),
      close: jest.fn(async () => {}),
    };
    mockFromBunker.mockReturnValue(bunker);

    const phases = jest.fn();
    await expect(loginWithBunker(
      `bunker://${pointer.pubkey}?relay=wss://relay.example&secret=${pointer.secret}`,
      phases,
    )).resolves.toEqual({ pubkey: 'user-pubkey' });

    expect(bunker.connect).toHaveBeenCalledWith({
      name: 'Walkie Talkie',
      url: 'https://bitcoinwalk.org',
    });
    expect(mockAddRemoteAccount).toHaveBeenCalledWith(expect.objectContaining({
      pubkey: 'user-pubkey',
      pointer: {
        pubkey: pointer.pubkey,
        relays: ['wss://relay.example/'],
        secret: null,
      },
    }));
    expect(bunker.close).toHaveBeenCalledTimes(1);
    expect(phases.mock.calls.map(([phase]) => phase)).toEqual(['approval', 'public_key', 'saving']);
  });

  test('distinguishes a local save failure after Amber accepted both requests', async () => {
    const bunker = {
      bp: { pubkey: 'a'.repeat(64), relays: ['wss://relay.example/'], secret: null },
      connect: jest.fn(async () => {}),
      getPublicKey: jest.fn(async () => 'user-pubkey'),
      close: jest.fn(async () => {}),
    };
    mockFromBunker.mockReturnValue(bunker);
    mockAddRemoteAccount.mockRejectedValueOnce(new Error('device storage failed'));
    await expect(loginWithBunker(`bunker://${'a'.repeat(64)}?relay=wss://relay.example`))
      .rejects.toMatchObject({ code: 'save_failed' });
    expect(bunker.close).toHaveBeenCalledTimes(1);
  });

  test('recovers a lost public-key request without reconnecting or replaying the secret', async () => {
    jest.useFakeTimers();
    try {
      const bunker = {
        bp: { pubkey: 'a'.repeat(64), relays: ['wss://relay.example/'], secret: 'one-time' },
        connect: jest.fn(async () => {}),
        getPublicKey: jest.fn<Promise<string>, []>()
          .mockImplementationOnce(() => new Promise(() => {}))
          .mockResolvedValueOnce('user-pubkey'),
        close: jest.fn(async () => {}),
      };
      mockFromBunker.mockReturnValue(bunker);
      const pending = loginWithBunker(`bunker://${'a'.repeat(64)}?relay=wss://relay.example&secret=one-time`);
      await jest.advanceTimersByTimeAsync(10_000);
      await expect(pending).resolves.toEqual({ pubkey: 'user-pubkey' });
      expect(bunker.connect).toHaveBeenCalledTimes(1);
      expect(mockFromBunker).toHaveBeenCalledTimes(1);
      expect(bunker.getPublicKey).toHaveBeenCalledTimes(2);
      expect(mockAddRemoteAccount).toHaveBeenCalledTimes(1);
      expect(mockAddRemoteAccount).toHaveBeenCalledWith(expect.objectContaining({
        pointer: expect.objectContaining({ secret: null }),
      }));
      expect(bunker.close).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test('reports Amber rejecting an already used connection link', async () => {
    const bunker = {
      connect: jest.fn(() => Promise.reject('already connected')),
      close: jest.fn(async () => {}),
    };
    mockFromBunker.mockReturnValue(bunker);
    await expect(loginWithBunker(`bunker://${'a'.repeat(64)}?relay=wss://relay.example`))
      .rejects.toMatchObject({ code: 'expired_link' });
    expect(mockAddRemoteAccount).not.toHaveBeenCalled();
    expect(bunker.close).toHaveBeenCalledTimes(1);
  });

  test('allows an interactive Amber approval to take longer than a normal RPC', async () => {
    jest.useFakeTimers();
    try {
      let approve!: () => void;
      mockFromBunker.mockReturnValue({
        bp: { pubkey: 'a'.repeat(64), relays: ['wss://relay.example/'], secret: null },
        connect: () => new Promise<void>((resolve) => { approve = resolve; }),
        getPublicKey: async () => 'user-pubkey',
        close: async () => {},
      });
      const pending = loginWithBunker(`bunker://${'a'.repeat(64)}?relay=wss://relay.example`);
      const result = expect(pending).resolves.toEqual({ pubkey: 'user-pubkey' });
      await jest.advanceTimersByTimeAsync(65_000);
      expect(mockAddRemoteAccount).not.toHaveBeenCalled();
      approve();
      await result;
    } finally {
      jest.useRealTimers();
    }
  });

  test('recovers after Amber approves while the Android app is backgrounded', async () => {
    jest.useFakeTimers();
    try {
      const bunker = {
        bp: { pubkey: 'a'.repeat(64), relays: ['wss://remote.bitcoinwalk.org/'], secret: 'one-time' },
        connect: jest.fn(() => new Promise<void>(() => {})),
        getPublicKey: jest.fn(async () => 'user-pubkey'),
        close: jest.fn(async () => {}),
      };
      mockFromBunker.mockReturnValue(bunker);

      const phases = jest.fn();
      const pending = loginWithBunker(
        `bunker://${'a'.repeat(64)}?relay=wss://remote.bitcoinwalk.org&secret=one-time`,
        phases,
      );
      await jest.advanceTimersByTimeAsync(0);
      expect(mockAppStateListener).not.toBeNull();
      mockAppState = 'background';
      mockAppStateListener?.(mockAppState);
      mockAppState = 'active';
      mockAppStateListener?.(mockAppState);
      await jest.advanceTimersByTimeAsync(500);

      await expect(pending).resolves.toEqual({ pubkey: 'user-pubkey' });
      expect(bunker.connect).toHaveBeenCalledTimes(1);
      expect(bunker.getPublicKey).toHaveBeenCalledTimes(1);
      expect(mockAddRemoteAccount).toHaveBeenCalledWith(expect.objectContaining({
        pointer: expect.objectContaining({ secret: null }),
      }));
      expect(phases.mock.calls.map(([phase]) => phase)).toEqual(['approval', 'public_key', 'saving']);
    } finally {
      jest.useRealTimers();
    }
  });
});

test('uses the dedicated BitcoinWalk transport for app-initiated Nostr Connect', () => {
  expect(NIP46_DEFAULT_RELAYS).toEqual(['wss://remote.bitcoinwalk.org/']);
});
