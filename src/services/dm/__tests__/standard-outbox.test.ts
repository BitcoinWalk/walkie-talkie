import { generateSecretKey, getPublicKey, finalizeEvent, nip44, type Event } from 'nostr-tools';
import { unwrapEvent } from 'nostr-tools/nip59';
import { db } from '@/db/client';
import { buildSigner } from '../../account/account.service';
import { buildRumor } from '../../crypto/nip17-gift-wrap';
import { resolvePeerMessagingMetadata } from '../peer-encryption-key.service';
import { relayMessageOutbox } from '../relay-message-outbox';

jest.mock('@/db/client', () => ({
  db: { select: jest.fn(), insert: jest.fn() },
}));
jest.mock('@/platform', () => ({
  platform: { notifications: { shouldNotifyNow: () => false } },
}));
jest.mock('../../account/account.service', () => ({ buildSigner: jest.fn() }));
jest.mock('../../relay/relay-pool', () => ({ relayPool: {} }));
jest.mock('../peer-encryption-key.service', () => ({
  resolvePeerMessagingMetadata: jest.fn(),
}));

it('persists a standard payload once and reuses its exact wrapper on retry', async () => {
  const sender = generateSecretKey(),
    receiver = generateSecretKey(),
    account = getPublicKey(sender),
    peer = getPublicKey(receiver);
  const signer = {
    getPublicKey: jest.fn(async () => account),
    signEvent: jest.fn(async (template) => finalizeEvent(template, sender)),
    nip44Encrypt: jest.fn(async (pubkey: string, text: string) =>
      nip44.v2.encrypt(text, nip44.v2.utils.getConversationKey(sender, pubkey)),
    ),
    destroy: jest.fn(),
  };
  jest.mocked(buildSigner).mockResolvedValue(signer);
  jest.mocked(resolvePeerMessagingMetadata).mockResolvedValue({
    encryptionPubkey: null,
    dmRelays: ['wss://inbox.example/'],
  });
  const payloads: {
    jobId: number;
    recipientPubkey: string;
    giftWrap: Event;
  }[] = [];
  jest.mocked(db.select).mockImplementation(
    () =>
      ({
        from: () => ({ where: () => ({ all: async () => payloads }) }),
      }) as never,
  );
  jest.mocked(db.insert).mockImplementation(
    () =>
      ({
        values: (value: (typeof payloads)[number]) => ({
          onConflictDoNothing: async () => {
            payloads.push(value);
          },
        }),
      }) as never,
  );
  const session = {
    accountPubkey: account,
    encryptionKeypair: {
      pubkey: 'a'.repeat(64),
      privkey: generateSecretKey(),
      createdAt: 1,
    },
    dmRelays: ['wss://self.example/'],
    signSeal: signer.signEvent,
  };
  const worker = relayMessageOutbox as unknown as {
    session: typeof session | null;
    generation: number;
    online: boolean;
    ensurePayloads: (
      job: unknown,
      rumor: unknown,
      targets: unknown[],
      session: unknown,
      generation: number,
    ) => Promise<void>;
  };
  worker.session = session;
  worker.generation = 1;
  worker.online = true;
  const rumor = buildRumor(
    {
      kind: 14,
      created_at: 1_700_000_000,
      tags: [['p', peer]],
      content: 'Independent client text',
    },
    account,
  );
  try {
    await worker.ensurePayloads(
      { id: 1, accountPubkey: account },
      rumor,
      [{ recipientPubkey: peer }],
      session,
      1,
    );
    expect(payloads).toHaveLength(1);
    const original = JSON.stringify(payloads[0].giftWrap);
    expect(unwrapEvent(payloads[0].giftWrap, receiver)).toEqual(rumor);
    await worker.ensurePayloads(
      { id: 1, accountPubkey: account },
      rumor,
      [{ recipientPubkey: peer }],
      session,
      1,
    );
    expect(payloads).toHaveLength(1);
    expect(JSON.stringify(payloads[0].giftWrap)).toBe(original);
    expect(signer.nip44Encrypt).toHaveBeenCalledTimes(1);
    expect(signer.destroy).toHaveBeenCalledTimes(1);
  } finally {
    relayMessageOutbox.deactivate();
  }
});
