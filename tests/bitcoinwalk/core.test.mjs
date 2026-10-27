import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WalkPresence } from '../../src/lib/bitcoinwalk/presence.mjs';

const eventId = 'a'.repeat(64);
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
