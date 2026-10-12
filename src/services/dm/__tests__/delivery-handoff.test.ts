import {
  beginRelayTargets,
  deliveryStatusStore,
  messageDeliveryVerdict,
  relayDeliveryVerdict,
  retryableRelayUrls,
  settleRelayTarget,
  surfacedCopies,
  type MessageDelivery,
} from '../delivery-status';

afterEach(() => {
  deliveryStatusStore.setState({ byId: {} });
});

it('keeps failed mirrors retryable after a majority-successful delivery', () => {
  const delivery: MessageDelivery = {
    rumorId: 'rumor',
    phase: 'sent',
    copies: [
      {
        recipient: 'recipient',
        self: false,
        relays: [
          { url: 'wss://one.example/', status: 'ok' },
          { url: 'wss://two.example/', status: 'ok' },
          { url: 'wss://three.example/', status: 'failed', error: 'rejected' },
        ],
      },
    ],
  };

  expect(relayDeliveryVerdict(2, 3)).toBe('sent');
  expect(retryableRelayUrls(delivery)).toEqual(['wss://three.example/']);
});

it('suppresses another retry while a target is pending', () => {
  const delivery: MessageDelivery = {
    rumorId: 'rumor',
    phase: 'sent',
    copies: [
      {
        recipient: 'recipient',
        self: false,
        relays: [
          { url: 'wss://one.example/', status: 'ok' },
          { url: 'wss://two.example/', status: 'pending' },
        ],
      },
    ],
  };

  expect(retryableRelayUrls(delivery)).toBeNull();
});

it('includes every frozen copy, including self, in delivery detail', () => {
  const self = { recipient: 'self', self: true, relays: [] };
  const recipient = { recipient: 'peer', self: false, relays: [] };

  expect(surfacedCopies([self, recipient])).toEqual([self, recipient]);
  expect(surfacedCopies([self])).toEqual([self]);
});

it('offers retry for a failed self/sync copy', () => {
  expect(
    retryableRelayUrls({
      rumorId: 'note-to-self',
      phase: 'failed',
      copies: [
        {
          recipient: 'self',
          self: true,
          relays: [{ url: 'wss://self.example/', status: 'failed' }],
        },
      ],
    }),
  ).toEqual(['wss://self.example/']);
});

it('derives queued, partial, sent, and failed from every copy', () => {
  const delivered = { relays: [{ url: 'wss://ok.example/', status: 'ok' as const }] };
  const failed = { relays: [], error: 'missing key' };
  const pending = { relays: [{ url: 'wss://wait.example/', status: 'pending' as const }] };

  expect(messageDeliveryVerdict([delivered, pending], true)).toBe('queued');
  expect(messageDeliveryVerdict([delivered, failed], false)).toBe('partial');
  expect(messageDeliveryVerdict([delivered, delivered], false)).toBe('sent');
  expect(messageDeliveryVerdict([failed, failed], false)).toBe('failed');
  expect(messageDeliveryVerdict([], true)).toBe('queued');
});

it('keeps the session store limited to nearby progress', () => {
  deliveryStatusStore.getState().setProximityPhase('rumor', 'awaiting_ack');

  expect(deliveryStatusStore.getState().byId.rumor).toEqual({
    rumorId: 'rumor',
    phase: 'awaiting_ack',
    transport: 'proximity',
    copies: [],
  });
});

it('allows every non-OK state to start while keeping OK terminal', () => {
  expect(
    beginRelayTargets(
      [
        { url: 'wss://ok.example/', status: 'ok' },
        { url: 'wss://failed.example/', status: 'failed', error: 'old' },
      ],
      ['wss://ok.example/', 'wss://failed.example/', 'wss://new.example/'],
    ),
  ).toEqual([
    { url: 'wss://ok.example/', status: 'ok' },
    { url: 'wss://failed.example/', status: 'pending' },
    { url: 'wss://new.example/', status: 'pending' },
  ]);
});

it('settles from the protocol boolean and never regresses OK', () => {
  const accepted = settleRelayTarget(
    [{ url: 'wss://relay.example/', status: 'pending' }],
    'wss://relay.example/',
    true,
  );
  expect(accepted).toEqual([{ url: 'wss://relay.example/', status: 'ok' }]);
  expect(
    settleRelayTarget(accepted, 'wss://relay.example/', false, 'duplicate'),
  ).toEqual(accepted);
});

it('merges legacy delivery aliases and keeps their OK terminal across retries', () => {
  const previous = [
    { url: 'https://RELAY.example//?z=2&a=1#fragment', status: 'ok' as const },
    { url: 'wss://relay.example/?a=1&z=2', status: 'failed' as const },
  ];
  const canonical = [{ url: 'wss://relay.example/?a=1&z=2', status: 'ok' }];
  expect(beginRelayTargets(previous, ['wss://relay.example/?z=2&a=1'])).toEqual(canonical);
  expect(settleRelayTarget(previous, 'wss://relay.example/?z=2&a=1', false, 'duplicate'))
    .toEqual(canonical);
  expect(retryableRelayUrls({ rumorId: 'rumor', phase: 'sent', copies: [
    { recipient: 'peer', self: false, relays: previous },
  ] })).toBeNull();
});
