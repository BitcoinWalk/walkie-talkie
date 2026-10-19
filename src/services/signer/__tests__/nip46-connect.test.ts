import { loginWithBunker } from '../nip46-connect.service';

const mockFromBunker = jest.fn();
const mockAddRemoteAccount = jest.fn(async (_opts: unknown) => ({ pubkey: 'user-pubkey' }));

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
  },
}));

describe('loginWithBunker', () => {
  beforeEach(() => {
    mockFromBunker.mockReset();
    mockAddRemoteAccount.mockClear();
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

    await expect(loginWithBunker(
      `bunker://${pointer.pubkey}?relay=wss://relay.example&secret=${pointer.secret}`,
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
  });
});
