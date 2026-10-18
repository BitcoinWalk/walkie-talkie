import {
  loadBitcoinWalkChatDirectory,
  parseBitcoinWalkChatDirectory,
} from '../chat-directory';
import { BITCOINWALK_ORIGIN } from '../config';

const directory = {
  version: 1,
  guidePubkey: 'a'.repeat(64),
  communities: {
    global: { relay: 'wss://chat.bitcoinwalk.org', groupId: 'global' },
    hosts: { relay: 'wss://chat.bitcoinwalk.org', groupId: 'bitcoinwalk-organizers' },
  },
};

describe('BitcoinWalk chat directory', () => {
  afterEach(() => jest.restoreAllMocks());

  it('accepts the pinned Guide identity and shared chat destinations', () => {
    expect(parseBitcoinWalkChatDirectory(directory)).toEqual({
      guidePubkey: directory.guidePubkey,
      communities: directory.communities,
    });
  });

  it.each([
    { ...directory, guidePubkey: 'not-a-pubkey' },
    { ...directory, communities: { ...directory.communities, hosts: {
      relay: 'wss://evil.example', groupId: 'hosts',
    } } },
    { ...directory, communities: { ...directory.communities, global: {
      relay: 'wss://chat.bitcoinwalk.org', groupId: '../global',
    } } },
  ])('rejects untrusted chat routing', (value) => {
    expect(() => parseBitcoinWalkChatDirectory(value)).toThrow('Invalid');
  });

  it('loads without caching and preserves cancellation', async () => {
    const controller = new AbortController();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(directory),
    } as Response);
    await expect(loadBitcoinWalkChatDirectory(controller.signal)).resolves.toEqual({
      guidePubkey: directory.guidePubkey,
      communities: directory.communities,
    });
    expect(fetch).toHaveBeenCalledWith(`${BITCOINWALK_ORIGIN}/api/chat/guide`,
      expect.objectContaining({ signal: controller.signal }));
  });
});
