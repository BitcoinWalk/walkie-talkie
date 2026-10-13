import { BITCOINWALK_ORIGIN } from './config';

export type Walk = {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  timeZone: string;
  link: string;
  address: string;
  latitude: number;
  longitude: number;
};

/** Reject incomplete feeds rather than presenting a misleading empty directory. */
export function parseWalkFeed(value: unknown, now = Date.now()): Walk[] {
  const feed = value as { version?: number; events?: unknown[] } | null;
  if (feed?.version !== 1 || !Array.isArray(feed.events) || feed.events.length > 2000) {
    throw new Error('Invalid walk feed');
  }
  const walks = new Map<string, Walk>();
  for (const entry of feed.events) {
    const walk = entry as Walk | null;
    if (!walk || !/^[a-f0-9]{64}$/.test(walk.id) ||
        !['name', 'description', 'startDate', 'endDate', 'timeZone', 'link', 'address'].every(
          (key) => typeof walk[key as keyof Walk] === 'string' &&
            String(walk[key as keyof Walk]).length <= 20000,
        ) || !walk.name || !Number.isFinite(Date.parse(walk.startDate)) ||
        !Number.isFinite(Date.parse(walk.endDate)) ||
        Date.parse(walk.endDate) < Date.parse(walk.startDate) ||
        !Number.isFinite(walk.latitude) || Math.abs(walk.latitude) > 90 ||
        !Number.isFinite(walk.longitude) || Math.abs(walk.longitude) > 180) {
      throw new Error('Invalid walk');
    }
    const url = new URL(walk.link);
    if (url.origin !== BITCOINWALK_ORIGIN || url.username || url.password || !/^\/[^/]+\/nevent1[a-z0-9]+$/.test(url.pathname)) {
      throw new Error('Invalid walk link');
    }
    new Intl.DateTimeFormat('en', { timeZone: walk.timeZone });
    if (Date.parse(walk.endDate) > now) walks.set(walk.id, walk);
  }
  return [...walks.values()].sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate));
}

export async function loadWalks(signal: AbortSignal): Promise<Walk[]> {
  const response = await fetch(`${BITCOINWALK_ORIGIN}/api/events`, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Walk feed unavailable');
  const body = await response.text();
  if (body.length > 4_000_000) throw new Error('Walk feed too large');
  return parseWalkFeed(JSON.parse(body));
}
