const mockBuildSigner = jest.fn();
const mockJoinCommunity = jest.fn();
const mockGetPreference = jest.fn();
const mockSetPreference = jest.fn();

jest.mock('@/services/account/account.service', () => ({
  buildSigner: (...args: unknown[]) => mockBuildSigner(...args),
}));
jest.mock('@/services/preferences/device-preferences.service', () => ({
  getDevicePreference: (...args: unknown[]) => mockGetPreference(...args),
  setDevicePreference: (...args: unknown[]) => mockSetPreference(...args),
}));
jest.mock('../community', () => ({
  joinCommunity: (...args: unknown[]) => mockJoinCommunity(...args),
}));

// Imports follow the hoisted Jest module factories above.
// eslint-disable-next-line import/first
import {
  ensureCommunityMemberships,
  hasCommunityMembership,
} from '../community-membership';

const city = { relay: 'wss://chat.bitcoinwalk.org', groupId: 'bitcoinwalk-madeira' };
const global = { relay: 'wss://chat.bitcoinwalk.org', groupId: 'global' };

describe('BitcoinWalk automatic community membership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPreference.mockResolvedValue(null);
    mockSetPreference.mockResolvedValue(undefined);
    mockJoinCommunity.mockResolvedValue('joined');
    mockBuildSigner.mockResolvedValue({ destroy: jest.fn() });
  });

  it('joins the city and global groups sequentially and remembers each success', async () => {
    await expect(ensureCommunityMemberships('pubkey', [city, global])).resolves.toEqual({
      joined: [expect.stringContaining('bitcoinwalk-madeira'), expect.stringContaining('global')],
      failed: [],
    });
    expect(mockJoinCommunity.mock.calls.map((call) => call[0])).toEqual([city, global]);
    expect(mockSetPreference).toHaveBeenCalledTimes(2);
    expect(mockBuildSigner.mock.results[0].value).toBeDefined();
  });

  it('does not ask the signer to join a previously confirmed group', async () => {
    mockGetPreference.mockResolvedValue(JSON.stringify({
      destinations: [`${city.relay}\n${city.groupId}`],
    }));
    await ensureCommunityMemberships('another-pubkey', [city]);
    expect(mockBuildSigner).not.toHaveBeenCalled();
    await expect(hasCommunityMembership('another-pubkey', city)).resolves.toBe(true);
  });
});
