import { nip19 } from 'nostr-tools';

import { activeMentionAt, insertMentionReference, mentionedPubkeys } from '../mentions';

const PUBKEY = 'a'.repeat(64);
const NPUB = nip19.npubEncode(PUBKEY);

describe('chat mentions', () => {
  it('finds an @ token at the caret and inserts a canonical profile reference', () => {
    expect(activeMentionAt('hello @ali', 10)).toEqual({ start: 6, end: 10, query: 'ali' });
    expect(insertMentionReference('hello @ali there', 10, NPUB)).toEqual({
      text: `hello nostr:${NPUB} there`,
      caret: 6 + `nostr:${NPUB}`.length,
    });
  });

  it('does not treat an email address as a mention', () => {
    expect(activeMentionAt('hello@example.org', 17)).toBeNull();
  });

  it('extracts unique mentioned pubkeys for event tags', () => {
    expect(mentionedPubkeys(`Hi nostr:${NPUB} and nostr:${NPUB}`)).toEqual([PUBKEY]);
  });
});
