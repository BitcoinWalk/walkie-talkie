import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const readText = (path) => readFileSync(new URL(path, root), 'utf8');

test('Walkie Talkie release versions stay aligned', () => {
  const app = readJson('app.json').expo;
  const packageJson = readJson('package.json');
  const desktop = readJson('desktop/package.json');
  const lock = readJson('package-lock.json');

  assert.match(app.version, /^\d{2}\.\d{1,2}\.\d+$/);
  assert.equal(packageJson.version, app.version);
  assert.equal(desktop.version, app.version);
  assert.equal(lock.version, app.version);
  assert.equal(lock.packages[''].version, app.version);
  assert.equal(lock.packages.desktop.version, app.version);
  assert.ok(Number.isInteger(app.android.versionCode) && app.android.versionCode > 0);
  assert.match(app.ios.buildNumber, /^\d+$/);

  const changelog = `fastlane/metadata/android/en-US/changelogs/${app.android.versionCode}.txt`;
  assert.ok(existsSync(new URL(changelog, root)), `Missing ${changelog}`);
  const notes = readText(changelog);
  assert.ok(notes.startsWith(`Walkie Talkie ${app.version}\n`));
  assert.ok([...notes].length <= 500, 'Android changelog exceeds 500 characters');
});

test('Zapstore selects the versioned BitcoinWalk release APK', () => {
  const version = readJson('app.json').expo.version;
  const config = readText('zapstore.yaml');
  const matchLine = config.split('\n').find((line) => line.startsWith('match: '));

  assert.match(config, /^repository: https:\/\/github\.com\/BitcoinWalk\/walkie-talkie$/m);
  assert.match(config, /^name: Walkie Talkie$/m);
  assert.match(config, /^website: https:\/\/bitcoinwalk\.org$/m);
  assert.match(config, /^pubkey: npub1jr8sgwrpuk66n9evk76jnfd6wxept4k3uv2vwjw42fhvzvl3mdes38wwnw$/m);
  assert.ok(matchLine);
  const pattern = new RegExp(matchLine.slice('match: '.length));
  assert.ok(pattern.test(`WalkieTalkie-${version}-android.apk`));
  assert.ok(!pattern.test(`WalkieTalkie-${version}-test-arm64.apk`));
  assert.ok(!pattern.test('PsstPsst-android.apk'));
});

test('release UI exposes the version and BitcoinWalk author', () => {
  const boot = readText('src/components/common/AppBootScreen.tsx');
  const about = readText('src/app/(app)/about.tsx');
  const archiveSharing = readText('src/services/dm/dm-backup-storage.ts');
  const storeMetadata = [
    readText('fastlane/metadata/android/en-US/title.txt'),
    readText('fastlane/metadata/android/en-US/short_description.txt'),
    readText('fastlane/metadata/android/en-US/full_description.txt'),
  ].join('\n');

  assert.match(boot, /Constants\.expoConfig\?\.version/);
  assert.match(boot, /t\('about\.version', \{ version \}\)/);
  assert.match(about, /npub1jr8sgwrpuk66n9evk76jnfd6wxept4k3uv2vwjw42fhvzvl3mdes38wwnw/);
  assert.match(about, /BitcoinWalk/);
  assert.doesNotMatch(about, /npub1syjmjy0dp62dhccq3g97fr87tngvpvzey08llyt6ul58m2zqpzps9wf6wl/);
  assert.match(archiveSharing, /dialogTitle: 'Walkie Talkie chat archive'/);
  assert.doesNotMatch(storeMetadata, /PsstPsst|psstpsst/);
});
