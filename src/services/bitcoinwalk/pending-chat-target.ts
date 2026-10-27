import {
  getDevicePreference,
  trySetDevicePreference,
} from '@/services/preferences/device-preferences.service';

const PREFERENCE_KEY = 'bitcoinwalk.pendingChatTarget';
const TARGET_TTL_MS = 15 * 60 * 1_000;
const HEX_PUBKEY = '[0-9a-f]{64}';
const CITY_SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
const COMMUNITY_HREF = new RegExp(`^/community\\?scope=(?:global|hosts|city&city=${CITY_SLUG})$`);
const GUIDE_HREF = new RegExp(`^/chat/${HEX_PUBKEY}\\?mode=guide$`);

type StoredTarget = { href: string; expiresAt: number };
let pending: StoredTarget | null = null;

export function isBitcoinWalkMobileHref(href: string): boolean {
  return href.length <= 256 && (COMMUNITY_HREF.test(href) || GUIDE_HREF.test(href));
}

export async function rememberPendingBitcoinWalkChatHref(href: string): Promise<void> {
  if (!isBitcoinWalkMobileHref(href)) throw new Error('Invalid BitcoinWalk chat target');
  pending = { href, expiresAt: Date.now() + TARGET_TTL_MS };
  await trySetDevicePreference(PREFERENCE_KEY, JSON.stringify(pending));
}

function parseStoredTarget(value: string | null): StoredTarget | null {
  if (!value) return null;
  try {
    const target = JSON.parse(value) as Partial<StoredTarget>;
    return typeof target.href === 'string' && isBitcoinWalkMobileHref(target.href) &&
      typeof target.expiresAt === 'number' && target.expiresAt > Date.now()
      ? { href: target.href, expiresAt: target.expiresAt }
      : null;
  } catch {
    return null;
  }
}

/** Consume the bounded post-sign-in target. Navigation never grants membership or role. */
export async function consumePendingBitcoinWalkChatHref(): Promise<string | null> {
  const target = pending ?? parseStoredTarget(await getDevicePreference(PREFERENCE_KEY));
  pending = null;
  await trySetDevicePreference(PREFERENCE_KEY, '');
  return target && target.expiresAt > Date.now() ? target.href : null;
}

export async function postSignInHref(): Promise<string> {
  return await consumePendingBitcoinWalkChatHref() ?? '/walks';
}
