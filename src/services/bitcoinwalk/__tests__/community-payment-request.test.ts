import { beginCommunityPaymentRequest, hasCommunityPaymentRequest, sendCommunityPaymentRequest } from '../community-payment-request';
import { buildSigner } from '@/services/account/account.service';
import { hasActiveCommunityMembership, sendCommunityMessage } from '../community';
import type { Signer } from '@/services/signer/signer.interface';

let mockId = 0;
jest.mock('@/platform', () => ({ platform: { deviceCrypto: { randomUUID: async () => `request-${++mockId}` } } }));
jest.mock('@/services/account/account.service', () => ({ buildSigner: jest.fn() }));
jest.mock('../community', () => ({ hasActiveCommunityMembership: jest.fn(), sendCommunityMessage: jest.fn() }));

const account = 'a'.repeat(64);
const destination = { relay: 'wss://chat.bitcoinwalk.org/', groupId: 'bitcoinwalk-organizers' };
const signer = { getPublicKey: jest.fn(async () => account), destroy: jest.fn() } as unknown as Signer;
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(buildSigner).mockResolvedValue(signer);
  jest.mocked(signer.getPublicKey).mockResolvedValue(account);
  jest.mocked(hasActiveCommunityMembership).mockResolvedValue(true);
});

it('binds opaque handoffs to one account and expires them after ten minutes', async () => {
  jest.useFakeTimers();
  try {
    const id = await beginCommunityPaymentRequest(account, destination);
    expect(hasCommunityPaymentRequest(id, account)).toBe(true);
    expect(hasCommunityPaymentRequest(id, 'b'.repeat(64))).toBe(false);
    expect(hasCommunityPaymentRequest([id], account)).toBe(false);
    jest.advanceTimersByTime(600_001);
    await expect(sendCommunityPaymentRequest(id, account, 'invoice')).rejects.toThrow('Expired');
    expect(buildSigner).not.toHaveBeenCalled();
  } finally { jest.useRealTimers(); }
});

it('rechecks Hosts membership and consumes a successful handoff', async () => {
  const id = await beginCommunityPaymentRequest(account, destination);
  await sendCommunityPaymentRequest(id, account, 'invoice');
  expect(hasActiveCommunityMembership).toHaveBeenCalledWith(destination, signer);
  expect(sendCommunityMessage).toHaveBeenCalledWith({ destination, signer, content: 'invoice', previousEventIds: [] });
  expect(hasCommunityPaymentRequest(id, account)).toBe(false);
  expect(signer.destroy).toHaveBeenCalledTimes(1);
});

it('does not send when membership has been removed', async () => {
  const id = await beginCommunityPaymentRequest(account, destination);
  jest.mocked(hasActiveCommunityMembership).mockResolvedValue(false);
  await expect(sendCommunityPaymentRequest(id, account, 'invoice')).rejects.toThrow('membership');
  expect(sendCommunityMessage).not.toHaveBeenCalled();
  expect(signer.destroy).toHaveBeenCalledTimes(1);
});

it('a newer handoff invalidates the previous destination', async () => {
  const old = await beginCommunityPaymentRequest(account, destination);
  const current = await beginCommunityPaymentRequest(account, { ...destination, groupId: 'global' });
  expect(hasCommunityPaymentRequest(old, account)).toBe(false);
  expect(hasCommunityPaymentRequest(current, account)).toBe(true);
});
