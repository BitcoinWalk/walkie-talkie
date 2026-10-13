import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWalkInvite, parseWalkInvite } from '../../src/lib/bitcoinwalk/invites.mjs';
import { WalkPresence } from '../../src/lib/bitcoinwalk/presence.mjs';

const cityId = 'e62592ac-a5fc-42df-8f31-94416f6ee8d5';
const eventId = 'a'.repeat(64);
test('city and exact walk invites round trip with environment isolation', () => {
  for (const event of [undefined, eventId]) {
    const link = createWalkInvite({ cityId, eventId: event });
    assert.equal(parseWalkInvite(link).cityId, cityId);
    assert.equal(parseWalkInvite(link).eventId, event);
    assert.equal(parseWalkInvite(link, 'staging'), null);
  }
});
test('reject misleading origins, credentials, duplicate parameters and malformed events', () => {
  const link = createWalkInvite({ cityId, eventId });
  for (const bad of [link.replace('bitcoinwalk.org', 'bitcoinwalk.org.evil.test'),
    link.replace('https://', 'https://user@'), `${link}&event=${eventId}`, `${link}#secret`, `${link}&relay=wss://evil.test`,
    link.replace(eventId, 'not-an-event')]) assert.equal(parseWalkInvite(bad), null);
});
const receipt = { eventId, participantId: 'b'.repeat(64), authenticated: true, directBluetooth: true, consent: true, insideMeetingArea: true };
const session = () => new WalkPresence({ eventId, startsAt: 1000, endsAt: 100000, selfId: 'c'.repeat(64) });
test('reconnects count once, nearby expires, and notification fires once', () => {
  const s = session();
  assert.equal(s.record(receipt, 2000), true);
  assert.equal(s.record(receipt, 3000), true);
  assert.deepEqual(s.snapshot(3000), { nearbyNow: 2, uniqueConnected: 2, notify: true });
  assert.deepEqual(s.snapshot(34000), { nearbyNow: 0, uniqueConnected: 2, notify: false });
  s.record(receipt, 35000);
  assert.equal(s.snapshot(35000).notify, false);
});
test('reject other walks, forwarded mesh receipts, missing consent and outside-window observations', () => {
  const s = session();
  for (const change of [{ eventId: 'd'.repeat(64) }, { directBluetooth: false }, { authenticated: false },
    { consent: false }, { insideMeetingArea: false }, { participantId: 'c'.repeat(64) }]) {
    assert.equal(s.record({ ...receipt, ...change }, 2000), false);
  }
  assert.equal(s.record(receipt, 0), false);
  assert.equal(s.record(receipt, 100001), false);
  assert.equal(s.snapshot(2000).uniqueConnected, 0);
});
