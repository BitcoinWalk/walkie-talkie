const PRODUCTION_ORIGIN = 'https://bitcoinwalk.org';
const STAGING_ORIGIN = 'https://app-staging.bitcoinwalk.org';

export function bitcoinWalkOrigin(
  configured = process.env.EXPO_PUBLIC_BITCOINWALK_ORIGIN,
): string {
  if (!configured) return PRODUCTION_ORIGIN;
  if (configured === PRODUCTION_ORIGIN || configured === STAGING_ORIGIN) return configured;
  throw new Error('Invalid BitcoinWalk origin');
}

export const BITCOINWALK_ORIGIN = bitcoinWalkOrigin();
