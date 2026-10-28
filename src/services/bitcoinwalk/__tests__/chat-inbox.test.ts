import type { Event } from 'nostr-tools';

import { loadBitcoinWalkInbox, loadJoinedDestinations } from '../chat-inbox';
import { relayPool } from '@/services/relay/relay-pool';
import { buildSigner } from '@/services/account/account.service';
import { loadCities } from '../cities';
import { loadBitcoinWalkChatDirectory } from '../chat-directory';
import { listCommunityMemberships } from '../community-membership';

jest.mock('@/services/account/account.service', () => ({ buildSigner: jest.fn() }));
jest.mock('@/services/relay/relay-pool', () => ({ relayPool: {query: jest.fn(), publishEvent: jest.fn()} }));
jest.mock('../cities', () => ({ loadCities: jest.fn() }));
jest.mock('../chat-directory', () => ({ loadBitcoinWalkChatDirectory: jest.fn() }));
jest.mock('../community-membership', () => ({
  communityDestinationKey: (value: {relay: string; groupId: string}) => `${value.relay}\n${value.groupId}`,
  listCommunityMemberships: jest.fn(),
}));

const relay = 'wss://chat.bitcoinwalk.org/';
const account = 'a'.repeat(64);
const destination = (groupId: string) => ({relay, groupId});
const destroy = jest.fn();
function membership(groupId: string, kind = 9000, time = 10, pubkey = account): Event {
  return {id: `${time}-${kind}`, kind, created_at: time, tags: [['h', groupId], ['p', pubkey]],
    content: '', pubkey: 'b'.repeat(64), sig: ''};
}

describe('bounded joined-community inbox discovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(buildSigner).mockResolvedValue({getPublicKey: async () => account, signEvent: jest.fn(), destroy});
    jest.mocked(relayPool.query).mockResolvedValue([]);
    jest.mocked(listCommunityMemberships).mockResolvedValue([]);
  });

  it('uses the latest membership for the exact account/group and never publishes a join', async () => {
    jest.mocked(relayPool.query).mockResolvedValue([
      membership('madeira'), membership('removed'), membership('removed', 9001, 11),
      membership('unapproved'), membership('other-account', 9000, 10, 'c'.repeat(64)),
    ]);
    const joined = await loadJoinedDestinations(account,
      ['madeira', 'removed', 'other-account'].map(destination), new AbortController().signal);
    expect([...joined]).toEqual([`${relay}\nmadeira`]);
    expect(relayPool.publishEvent).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('bounds each query, deduplicates destinations, and separates relays', async () => {
    const destinations = Array.from({length: 205}, (_, i) => destination(`city-${i}`));
    await loadJoinedDestinations(account, [...destinations, destinations[0],
      {relay: 'wss://chat-staging.bitcoinwalk.org/', groupId: 'madeira'}], new AbortController().signal);
    expect(relayPool.query).toHaveBeenCalledTimes(27);
    const queries = jest.mocked(relayPool.query).mock.calls.map(([query]) => query);
    expect(queries.map((query) => query.filters?.length)).toEqual([...Array(25).fill(8), 5, 1]);
    const filters = queries.flatMap((query) => query.filters ?? []);
    expect(filters).toHaveLength(206);
    for (const filter of filters) {
      expect(filter['#h']).toHaveLength(1);
      expect(filter['#p']).toEqual([account]);
      expect(filter.limit).toBeLessThanOrEqual(200);
    }
  });

  it('discovers Madeira and Hosts against the actual single-group relay filter contract', async () => {
    const city = {id: 'madeira', name: 'Madeira', slug: 'madeira',
      chat: {communities: {city: destination('bitcoinwalk-madeira')}}};
    jest.mocked(loadCities).mockResolvedValue([city] as Awaited<ReturnType<typeof loadCities>>);
    jest.mocked(loadBitcoinWalkChatDirectory).mockResolvedValue({guidePubkey: 'b'.repeat(64),
      communities: {global: destination('global'), hosts: destination('bitcoinwalk-organizers')}});
    jest.mocked(relayPool.query).mockImplementation(async (query) => {
      const filters = query.filters ?? (query.filter ? [query.filter] : []);
      for (const filter of filters) {
        if (filter['#h']?.length !== 1 || filter['#p']?.length !== 1 ||
            filter['#p'][0] !== account || (filter.limit ?? 0) > 200) {
          throw new Error('restricted: request one chat group explicitly');
        }
      }
      return filters.map((filter) => membership(filter['#h']![0]));
    });
    const result = await loadBitcoinWalkInbox(account, new AbortController().signal);
    expect(result.cities.map((value) => value.slug)).toEqual(['madeira']);
    expect(result.hosts).toBe(true);
    expect(result.membershipError).toBeUndefined();
    expect(relayPool.publishEvent).not.toHaveBeenCalled();
  });

  it('still checks Hosts if the city lookup fails instead of hiding both groups', async () => {
    const city = {id: 'madeira', name: 'Madeira', slug: 'madeira',
      chat: {communities: {city: destination('bitcoinwalk-madeira')}}};
    jest.mocked(loadCities).mockResolvedValue([city] as Awaited<ReturnType<typeof loadCities>>);
    jest.mocked(loadBitcoinWalkChatDirectory).mockResolvedValue({guidePubkey: 'b'.repeat(64),
      communities: {global: destination('global'), hosts: destination('bitcoinwalk-organizers')}});
    jest.mocked(relayPool.query).mockRejectedValueOnce(new Error('city lookup interrupted'))
      .mockResolvedValueOnce([membership('bitcoinwalk-organizers')]);
    const result = await loadBitcoinWalkInbox(account, new AbortController().signal);
    expect(result.hosts).toBe(true);
    expect(result.membershipError).toBe(true);
  });

  it('cleans up on failure and honors cancellation before relay work', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(loadJoinedDestinations(account, [destination('madeira')], controller.signal)).rejects.toThrow('Aborted');
    expect(relayPool.query).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('returns every joined approved city alphabetically and hides removed Hosts', async () => {
    const city = (name: string) => ({id: name, name, slug: name.toLowerCase(), chat: {communities: {city: destination(name)}}});
    jest.mocked(loadCities).mockResolvedValue([city('Madeira'), city('Austin'), city('London')] as Awaited<ReturnType<typeof loadCities>>);
    jest.mocked(loadBitcoinWalkChatDirectory).mockResolvedValue({guidePubkey: 'b'.repeat(64),
      communities: {global: destination('global'), hosts: destination('hosts')}});
    jest.mocked(relayPool.query).mockResolvedValue([
      membership('Austin'), membership('Madeira'), membership('hosts'), membership('hosts', 9001, 11),
    ]);
    const result = await loadBitcoinWalkInbox(account, new AbortController().signal);
    expect(result.cities.map((value) => value.name)).toEqual(['Austin', 'Madeira']);
    expect(result.hosts).toBe(false);
  });

  it('keeps Guide and Global available if city membership lookup fails', async () => {
    jest.mocked(loadCities).mockResolvedValue([]);
    jest.mocked(loadBitcoinWalkChatDirectory).mockResolvedValue({guidePubkey: 'b'.repeat(64),
      communities: {global: destination('global'), hosts: destination('hosts')}});
    jest.mocked(buildSigner).mockRejectedValue(new Error('signer unavailable'));
    const result = await loadBitcoinWalkInbox(account, new AbortController().signal);
    expect(result.directory.guidePubkey).toBe('b'.repeat(64));
    expect(result).toMatchObject({cities: [], hosts: false, membershipError: true});
  });

  it('bounds unavailable remote signing and falls back to saved city membership', async () => {
    jest.useFakeTimers();
    try {
      const city = {id: 'madeira', name: 'Madeira', slug: 'madeira',
        chat: {communities: {city: destination('bitcoinwalk-madeira')}}};
      jest.mocked(loadCities).mockResolvedValue([city] as Awaited<ReturnType<typeof loadCities>>);
      jest.mocked(loadBitcoinWalkChatDirectory).mockResolvedValue({guidePubkey: 'b'.repeat(64),
        communities: {global: destination('global'), hosts: destination('bitcoinwalk-organizers')}});
      jest.mocked(listCommunityMemberships).mockResolvedValue([destination('bitcoinwalk-madeira')]);
      jest.mocked(relayPool.query).mockImplementation((query) => new Promise((_resolve, reject) => {
        query.abort?.addEventListener('abort', () => {
          const error = new Error('Relay query was cancelled.');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      }));

      const pending = loadBitcoinWalkInbox(account, new AbortController().signal);
      await jest.advanceTimersByTimeAsync(7_999);
      let settled = false;
      void pending.then(() => { settled = true; });
      await Promise.resolve();
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(1);

      await expect(pending).resolves.toMatchObject({
        cities: [expect.objectContaining({slug: 'madeira'})],
        hosts: false,
        membershipError: true,
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
