import {
  clearDeferredDmSync,
  deferDmSync,
  isDmSyncDeferred,
} from '../dm-sync-preferences';
import {
  deleteDevicePreference,
  getDevicePreference,
  setDevicePreference,
} from '@/services/preferences/device-preferences.service';

jest.mock('@/services/preferences/device-preferences.service', () => ({
  deleteDevicePreference: jest.fn(),
  getDevicePreference: jest.fn(),
  setDevicePreference: jest.fn(),
}));

const PUBKEY = 'a'.repeat(64);
const KEY = `bitcoinwalk.dmSyncDeferred.v1.${PUBKEY}`;

beforeEach(() => jest.clearAllMocks());

it('persists and reads the per-account BitcoinWalk-only choice', async () => {
  jest.mocked(getDevicePreference).mockResolvedValue('1');
  await expect(isDmSyncDeferred(PUBKEY)).resolves.toBe(true);
  expect(getDevicePreference).toHaveBeenCalledWith(KEY);

  await deferDmSync(PUBKEY);
  expect(setDevicePreference).toHaveBeenCalledWith(KEY, '1');
});

it('clears the choice after private-message recovery', async () => {
  await clearDeferredDmSync(PUBKEY);
  expect(deleteDevicePreference).toHaveBeenCalledWith(KEY);
});
