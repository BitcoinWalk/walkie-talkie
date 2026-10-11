import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { compileModsAsync } = require('expo/config-plugins');
const withNotificationExtension = require('../../plugins/with-notification-extension');
const identities = require('../../config/app-identities.json');
const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

for (const { id } of Object.values(identities)) {
  const privateGroup = `$(AppIdentifierPrefix)${id}`;
  const sharedGroup = `${privateGroup}.notifications`;
  for (const [scenario, existingGroups] of [
    ['fresh configuration', []],
    ['previous shared default', [sharedGroup]],
    ['existing private and custom groups', [privateGroup, '$(AppIdentifierPrefix)custom', sharedGroup]],
  ]) {
    test(`${id}: preserves private Keychain storage with ${scenario}`, async () => {
      let config = {
        name: 'PsstPsst', slug: 'psstpsst',
        ios: { bundleIdentifier: id, entitlements: { 'keychain-access-groups': existingGroups } },
      };
      for (let pass = 0; pass < 2; pass++) {
        config = await compileModsAsync(withNotificationExtension(config), {
          projectRoot, platforms: ['ios'], introspect: true, ignoreExistingNativeFiles: true,
        });
        const entitlements = config._internal.modResults.ios.entitlements;
        assert.deepEqual(entitlements['keychain-access-groups'],
          [...new Set([privateGroup, ...existingGroups, sharedGroup])]);
        const extension = config.extra.eas.build.experimental.ios.appExtensions[0];
        assert.deepEqual(extension.entitlements['keychain-access-groups'], [sharedGroup]);
        assert.equal(extension.entitlements['keychain-access-groups'].includes(privateGroup), false);
        config = { ...config, mods: undefined, ios: { ...config.ios, entitlements } };
      }
    });
  }
}
