import {
  getDevicePreference,
  trySetDevicePreference,
} from '@/services/preferences/device-preferences.service';
import {
  consumePendingBitcoinWalkChatHref,
  isBitcoinWalkMobileHref,
  postSignInHref,
  rememberPendingBitcoinWalkChatHref,
} from '../pending-chat-target';

jest.mock('@/services/preferences/device-preferences.service', () => ({
  getDevicePreference: jest.fn(async () => null),
  trySetDevicePreference: jest.fn(async () => {}),
}));

describe('pending BitcoinWalk chat target', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.mocked(getDevicePreference).mockResolvedValue(null);
    await consumePendingBitcoinWalkChatHref();
    jest.clearAllMocks();
  });

  it.each([
    '/community?scope=city&city=madeira',
    '/community?scope=global',
    '/community?scope=hosts',
    `/chat/${'a'.repeat(64)}?mode=guide`,
  ])('accepts the authority-free native target %s', (href) => {
    expect(isBitcoinWalkMobileHref(href)).toBe(true);
  });

  it.each([
    '/community?scope=city&city=../madeira',
    '/community?scope=global&role=admin',
    `/chat/${'a'.repeat(64)}?mode=guide&account=attacker`,
    'https://bitcoinwalk.org/chat/global',
  ])('rejects unsafe or non-native target %s', (href) => {
    expect(isBitcoinWalkMobileHref(href)).toBe(false);
  });

  it('persists and consumes a target exactly once', async () => {
    const href = '/community?scope=city&city=madeira';
    await rememberPendingBitcoinWalkChatHref(href);

    expect(trySetDevicePreference).toHaveBeenCalledWith(
      'bitcoinwalk.pendingChatTarget',
      expect.stringContaining(href),
    );
    await expect(consumePendingBitcoinWalkChatHref()).resolves.toBe(href);
    await expect(postSignInHref()).resolves.toBe('/walks');
  });

  it('restores an unexpired target after restart and clears it', async () => {
    jest.mocked(getDevicePreference).mockResolvedValue(JSON.stringify({
      href: '/community?scope=global',
      expiresAt: Date.now() + 60_000,
    }));

    await expect(postSignInHref()).resolves.toBe('/community?scope=global');
    expect(trySetDevicePreference).toHaveBeenLastCalledWith(
      'bitcoinwalk.pendingChatTarget',
      '',
    );
  });

  it('drops an expired stored target', async () => {
    jest.mocked(getDevicePreference).mockResolvedValue(JSON.stringify({
      href: '/community?scope=global',
      expiresAt: Date.now() - 1,
    }));

    await expect(postSignInHref()).resolves.toBe('/walks');
  });
});
