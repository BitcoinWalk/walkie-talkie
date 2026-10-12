import type { EventTemplate } from 'nostr-tools';

import { DISCOVERY_RELAYS, normalizeRelayUrl } from '@/lib/nostr/relay-url';

import { fetchReplaceable, parseRelayListMetadata } from './relay-router';
import { getReplaceableEvent, storeReplaceableEvent } from './replaceable-events.service';

/** Resolve a fresh read declaration without depending on signing or publication. */
export async function prepareWriteRelayConfiguration(
  accountPubkey: string, urls: string[], checkCurrent: () => void = () => {},
): Promise<{ template: EventTemplate; previousEventId: string | null }> {
  const write = Array.from(new Set(urls.map(normalizeRelayUrl)));
  if (!write.length) throw new Error('At least one write relay is required.');
  const key = { pubkey: accountPubkey, kind: 10002 };
  const cached = await getReplaceableEvent(key);
  const targets = Array.from(new Set([
    ...DISCOVERY_RELAYS.map(normalizeRelayUrl), ...write,
    ...(cached ? parseRelayListMetadata(cached).write : []),
  ]));
  const remote = await fetchReplaceable(targets, key.kind, key.pubkey);
  checkCurrent();
  if (remote) await storeReplaceableEvent(remote);
  const current = await getReplaceableEvent(key);
  const tags: string[][] = [];
  const writeSet = new Set(write);
  const readSeen = new Set<string>();
  for (const tag of current?.tags ?? []) {
    if (tag[0] !== 'r' || !tag[1]) {
      tags.push(tag);
    } else if (tag[2] === undefined || tag[2] === '' || tag[2] === 'read') {
      let url: string;
      try { url = normalizeRelayUrl(tag[1]); } catch {
        tags.push(tag[2] === 'read' ? tag : ['r', tag[1], 'read', ...tag.slice(3)]);
        continue;
      }
      if (readSeen.has(url)) continue;
      readSeen.add(url);
      const extensions = tag.slice(3);
      // Keep the role slot empty when extension fields follow a shared relay.
      tags.push(writeSet.has(url)
        ? ['r', url, ...(extensions.length > 0 ? ['', ...extensions] : [])]
        : ['r', url, 'read', ...extensions]);
    } else if (tag[2] !== 'write') {
      tags.push(tag);
    }
  }
  for (const url of write) {
    if (!readSeen.has(url)) tags.push(['r', url, 'write']);
  }
  return {
    template: { kind: key.kind, tags, content: current?.content ?? '', created_at: Math.floor(Date.now() / 1000) },
    previousEventId: current?.id ?? null,
  };
}
