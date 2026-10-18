import { finalizeEvent, generateSecretKey, getEventHash, getPublicKey, nip44 } from 'nostr-tools';
import { wrapEvent, unwrapEvent } from 'nostr-tools/nip59';

import {
  buildRumor,
  unwrapGiftWrapWithSigner,
  createStandardGiftWrappedMessage,
  canSendStandardNip17,
} from '../nip17-gift-wrap';

function fixture() {
  const sender = generateSecretKey();
  const recipient = generateSecretKey();
  const account = getPublicKey(recipient);
  const rumor = buildRumor(
    {
      kind: 14,
      created_at: 1_700_000_000,
      content: 'Your BitcoinWalk is ready',
      tags: [['p', account]],
    },
    getPublicKey(sender),
  );
  const wrap = wrapEvent(rumor, sender, account);
  const signer = {
    getPublicKey: jest.fn(async () => account),
    signEvent: jest.fn(),
    nip44Decrypt: jest.fn(async (peer: string, ciphertext: string) =>
      nip44.v2.decrypt(ciphertext, nip44.v2.utils.getConversationKey(recipient, peer)),
    ),
  };
  return { account, rumor, wrap, signer, sender };
}

it('reads a standard nostr-tools Guide envelope through the identity signer', async () => {
  const { account, rumor, wrap, signer } = fixture();
  const result = await unwrapGiftWrapWithSigner(wrap, account, signer, () => true);
  expect(result).toMatchObject({
    status: 'decrypted',
    value: { rumor, protocol: 'nip17' },
  });
  expect(signer.nip44Decrypt).toHaveBeenCalledTimes(2);
  expect(signer.signEvent).not.toHaveBeenCalled();
});

it('rejects bad outer signatures before contacting the signer', async () => {
  const { account, wrap, signer } = fixture();
  expect(
    await unwrapGiftWrapWithSigner({ ...wrap, content: 'tampered' }, account, signer, () => true),
  ).toEqual({ status: 'failed' });
  expect(signer.getPublicKey).not.toHaveBeenCalled();
});

it('rejects the wrong outer recipient without contacting the signer', async () => {
  const { wrap, signer } = fixture();
  expect(await unwrapGiftWrapWithSigner(wrap, 'a'.repeat(64), signer, () => true)).toEqual({
    status: 'failed',
  });
  expect(signer.getPublicKey).not.toHaveBeenCalled();
});

it('rejects a signer attached to another account', async () => {
  const { account, wrap, signer } = fixture();
  signer.getPublicKey.mockResolvedValue('a'.repeat(64));
  expect(await unwrapGiftWrapWithSigner(wrap, account, signer, () => true)).toEqual({
    status: 'failed',
  });
  expect(signer.nip44Decrypt).not.toHaveBeenCalled();
});

it('stops between decryptions when the account session changes', async () => {
  const { account, wrap, signer } = fixture();
  expect(
    await unwrapGiftWrapWithSigner(
      wrap,
      account,
      signer,
      () => signer.nip44Decrypt.mock.calls.length === 0,
    ),
  ).toEqual({ status: 'failed' });
  expect(signer.nip44Decrypt).toHaveBeenCalledTimes(1);
});

it('allows retry after signer rejection', async () => {
  const { account, wrap, signer } = fixture();
  signer.nip44Decrypt.mockRejectedValueOnce(new Error('User declined'));
  expect(await unwrapGiftWrapWithSigner(wrap, account, signer, () => true)).toEqual({
    status: 'failed',
  });
  expect(await unwrapGiftWrapWithSigner(wrap, account, signer, () => true)).toMatchObject({
    status: 'decrypted',
  });
});

it.each(['author', 'hash', 'recipient', 'group', 'kind', 'seal-tags', 'seal-signature'])(
  'rejects invalid %s after authenticated outer decryption',
  async (fault) => {
    const { account, wrap, signer, rumor, sender } = fixture();
    const bad = { ...rumor, tags: [...rumor.tags] };
    if (fault === 'author') bad.pubkey = 'b'.repeat(64);
    if (fault === 'hash') bad.id = 'b'.repeat(64);
    if (fault === 'recipient') bad.tags = [];
    if (fault === 'group') bad.tags.push(['h', 'private-group']);
    if (fault === 'kind') bad.kind = 7;
    if (fault !== 'hash') bad.id = getEventHash(bad);
    const seal = finalizeEvent(
      {
        kind: 13,
        created_at: 1_700_000_000,
        content: 'opaque',
        tags: fault === 'seal-tags' ? [['n', getPublicKey(sender)]] : [],
      },
      sender,
    );
    if (fault === 'seal-signature') seal.sig = '0'.repeat(128);
    signer.nip44Decrypt
      .mockResolvedValueOnce(JSON.stringify(seal))
      .mockResolvedValueOnce(JSON.stringify(bad));
    expect(await unwrapGiftWrapWithSigner(wrap, account, signer, () => true)).toEqual({
      status: 'failed',
    });
  },
);

describe('standard NIP-17 outbound interoperability', () => {
  function outbound() {
    const sender = generateSecretKey(),
      recipient = generateSecretKey();
    const account = getPublicKey(sender),
      peer = getPublicKey(recipient);
    const rumor = buildRumor(
      {
        kind: 14,
        created_at: 1_700_000_000,
        tags: [['p', peer]],
        content: 'Hello from BitcoinWalk',
      },
      account,
    );
    const signer = {
      getPublicKey: jest.fn(async () => account),
      signEvent: jest.fn(async (template) => finalizeEvent(template, sender)),
      nip44Encrypt: jest.fn(async (pubkey: string, plaintext: string) =>
        nip44.v2.encrypt(plaintext, nip44.v2.utils.getConversationKey(sender, pubkey)),
      ),
    };
    return { sender, recipient, account, peer, rumor, signer };
  }

  it('opens in independent nostr-tools with no private-key export or n-tag extension', async () => {
    const { recipient, peer, rumor, signer } = outbound();
    const wrapped = await createStandardGiftWrappedMessage({
      rumor,
      recipientIdentityPubkey: peer,
      signer,
      isCurrent: () => true,
    });
    expect(wrapped.seal.tags).toEqual([]);
    expect(wrapped.giftWrap.tags).toEqual([['p', peer]]);
    expect(unwrapEvent(wrapped.giftWrap, recipient)).toEqual(rumor);
    expect(signer.nip44Encrypt).toHaveBeenCalledTimes(1);
    expect(wrapped.rumor.id).toBe(rumor.id);
  });

  it.each(['group', 'file', 'reaction', 'action', 'multi-recipient'])(
    'never downgrades %s extension content',
    async (fault) => {
      const { account, peer, rumor, signer } = outbound();
      if (fault === 'group') rumor.tags.push(['h', 'private-group']);
      if (fault === 'action') rumor.tags.push(['action', 'invite']);
      if (fault === 'file') rumor.kind = 15;
      if (fault === 'reaction') rumor.kind = 7;
      if (fault === 'multi-recipient') rumor.tags.push(['p', 'a'.repeat(64)]);
      rumor.id = getEventHash(rumor);
      expect(canSendStandardNip17(rumor, account, peer)).toBe(false);
      await expect(
        createStandardGiftWrappedMessage({
          rumor,
          recipientIdentityPubkey: peer,
          signer,
          isCurrent: () => true,
        }),
      ).rejects.toThrow(/does not support/);
      expect(signer.nip44Encrypt).not.toHaveBeenCalled();
    },
  );

  it('stops before signing if the account changes during encryption', async () => {
    const { peer, rumor, signer } = outbound();
    let current = true;
    signer.nip44Encrypt.mockImplementationOnce(async () => {
      current = false;
      return 'ciphertext';
    });
    await expect(
      createStandardGiftWrappedMessage({
        rumor,
        recipientIdentityPubkey: peer,
        signer,
        isCurrent: () => current,
      }),
    ).rejects.toThrow(/account changed/);
    expect(signer.signEvent).not.toHaveBeenCalled();
  });

  it('rejects a wrong signer and a changed signed seal', async () => {
    const { peer, rumor, signer, sender } = outbound();
    signer.getPublicKey.mockResolvedValueOnce('b'.repeat(64));
    await expect(
      createStandardGiftWrappedMessage({
        rumor,
        recipientIdentityPubkey: peer,
        signer,
        isCurrent: () => true,
      }),
    ).rejects.toThrow(/mismatch/);
    signer.signEvent.mockImplementationOnce(async (template) =>
      finalizeEvent({ ...template, content: 'changed' }, sender),
    );
    await expect(
      createStandardGiftWrappedMessage({
        rumor,
        recipientIdentityPubkey: peer,
        signer,
        isCurrent: () => true,
      }),
    ).rejects.toThrow(/mismatched/);
  });
});
