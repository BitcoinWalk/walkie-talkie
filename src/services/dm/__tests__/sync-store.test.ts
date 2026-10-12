import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

import {
  clearSyncCursorCache,
  configureSyncRelays,
  getRelaySyncCursor,
  getSyncCursor,
  peekSyncCursor,
  setBackwardUntil,
  setForwardSince,
} from '../sync-store';

let mockSqlite: DatabaseSync;
let mockReads = 0;
jest.mock('@/db/client', () => {
  const { DatabaseSync } = jest.requireActual('node:sqlite');
  const { createAsyncDatabase } = jest.requireActual('@/platform/create-async-database');
  const schema = jest.requireActual('@/db/schema');
  mockSqlite = new DatabaseSync(':memory:');
  mockSqlite.exec(`CREATE TABLE sync_cursors (
    account_pubkey TEXT NOT NULL, relay_url TEXT NOT NULL,
    forward_since INTEGER, backward_until INTEGER, updated_at INTEGER NOT NULL,
    PRIMARY KEY (account_pubkey, relay_url)
  );`);
  return { db: createAsyncDatabase({
    async transaction(task: (executor: unknown) => Promise<unknown>) {
      mockSqlite.exec('BEGIN');
      try {
        const result = await task(this);
        mockSqlite.exec('COMMIT');
        return result;
      } catch (error) {
        mockSqlite.exec('ROLLBACK');
        throw error;
      }
    },
    async execute(query: string, params: SQLInputValue[], method: string) {
      const statement = mockSqlite.prepare(query);
      statement.setReturnArrays(true);
      if (method === 'run') { statement.run(...params); return { rows: [] }; }
      mockReads++;
      return { rows: statement.all(...params) };
    },
  }, schema) };
});

const first = 'wss://first.example';
const second = 'wss://second.example';
beforeEach(() => {
  for (const account of ['a', 'b']) clearSyncCursorCache(account);
  mockSqlite.exec('DELETE FROM sync_cursors');
  mockReads = 0;
});
afterAll(() => mockSqlite.close());

it('migrates a root relay cursor without a trailing slash and preserves its progress', async () => {
  mockSqlite.prepare('INSERT INTO sync_cursors VALUES (?, ?, ?, ?, ?)')
    .run('a', 'wss://first.example', 100, 20, 1);
  configureSyncRelays('a', ['wss://first.example/']);
  expect(await getRelaySyncCursor('a', 'wss://first.example'))
    .toEqual({ forwardSince: 100, backwardUntil: 20 });
  expect(mockSqlite.prepare('SELECT relay_url FROM sync_cursors').all())
    .toEqual([{ relay_url: 'wss://first.example/' }]);
  clearSyncCursorCache('a');
  expect(await getRelaySyncCursor('a', 'wss://first.example/'))
    .toEqual({ forwardSince: 100, backwardUntil: 20 });
});

it('merges legacy relay aliases conservatively and persists one canonical cursor', async () => {
  const insert = mockSqlite.prepare('INSERT INTO sync_cursors VALUES (?, ?, ?, ?, ?)');
  insert.run('a', 'wss://FIRST.example//?b=2&a=1#fragment', 200, 50, 1);
  insert.run('a', 'wss://first.example?a=1&b=2', 100, 0, 2);
  configureSyncRelays('a', ['https://first.example/?b=2&a=1']);
  expect(await getRelaySyncCursor('a', 'wss://first.example?a=1&b=2'))
    .toEqual({ forwardSince: 100, backwardUntil: 50 });
  expect(mockSqlite.prepare('SELECT count(*) AS n FROM sync_cursors').get()).toEqual({ n: 1 });
  await setForwardSince('a', 'https://first.example/?b=2&a=1', 300);
  clearSyncCursorCache('a');
  expect(await getRelaySyncCursor('a', 'wss://first.example?a=1&b=2'))
    .toEqual({ forwardSince: 300, backwardUntil: 50 });
});

it('isolates account/relay progress, normalizes URLs, and restores frontiers after a restart', async () => {
  await setForwardSince('a', `${first}/`, 100);
  await setBackwardUntil('a', first, 0);
  await setForwardSince('a', second, 50);
  await setBackwardUntil('a', second, 25);
  await setForwardSince('b', first, 10);
  clearSyncCursorCache('a');
  configureSyncRelays('a', [first, second]);
  expect(await getRelaySyncCursor('a', first)).toEqual({ forwardSince: 100, backwardUntil: 0 });
  expect(await getRelaySyncCursor('a', second)).toEqual({ forwardSince: 50, backwardUntil: 25 });
  expect(await getRelaySyncCursor('b', first)).toEqual({ forwardSince: 10, backwardUntil: null });
  expect(await getSyncCursor('a')).toEqual({ forwardSince: 50, backwardUntil: 25 });
  expect(mockSqlite.prepare('SELECT count(*) AS n FROM sync_cursors').get()).toEqual({ n: 3 });
});

it('shares one bounded cursor read across independent relay tasks and caches repeated lookups', async () => {
  const cursors = await Promise.all([getRelaySyncCursor('a', first), getRelaySyncCursor('a', second)]);
  expect(cursors).toEqual([{ forwardSince: null, backwardUntil: null }, { forwardSince: null, backwardUntil: null }]);
  await getRelaySyncCursor('a', first);
  await getSyncCursor('a');
  expect(mockReads).toBe(1);
});

it('seeds a new relay from existing coverage and excludes removed relays', async () => {
  configureSyncRelays('a', [first]);
  await setForwardSince('a', first, 100);
  await setBackwardUntil('a', first, 0);
  expect(peekSyncCursor('a')).toEqual({ forwardSince: 100, backwardUntil: 0 });
  configureSyncRelays('a', [first, second]);
  expect(peekSyncCursor('a')).toEqual({ forwardSince: null, backwardUntil: null });
  expect(await getRelaySyncCursor('a', second)).toEqual({ forwardSince: 100, backwardUntil: 0 });
  expect(peekSyncCursor('a')).toEqual({ forwardSince: 100, backwardUntil: 0 });
  await setForwardSince('a', second, 50);
  await setBackwardUntil('a', second, 0);
  expect(peekSyncCursor('a')).toEqual({ forwardSince: 50, backwardUntil: 0 });
  configureSyncRelays('a', [first]);
  expect(peekSyncCursor('a')).toEqual({ forwardSince: 100, backwardUntil: 0 });
  expect(await getRelaySyncCursor('a', second)).toEqual({ forwardSince: 50, backwardUntil: 0 });
});


it('copies the shortest covered interval as a pair and persists concurrent additions before synchronization', async () => {
  const third = 'wss://third.example';
  const fourth = 'wss://fourth.example';
  configureSyncRelays('a', [first, second, third, fourth]);
  await setForwardSince('a', first, 100);
  await setBackwardUntil('a', first, 0);
  await setForwardSince('a', second, 200);
  await setBackwardUntil('a', second, 150);
  const added = await Promise.all([
    getRelaySyncCursor('a', third), getRelaySyncCursor('a', `${third}/`), getRelaySyncCursor('a', fourth),
  ]);
  expect(added).toEqual(Array.from({ length: 3 }, () => ({ forwardSince: 200, backwardUntil: 150 })));
  expect(mockSqlite.prepare('SELECT count(*) AS n FROM sync_cursors').get()).toEqual({ n: 4 });
  clearSyncCursorCache('a');
  expect(await getRelaySyncCursor('a', third)).toEqual({ forwardSince: 200, backwardUntil: 150 });
  expect(await getRelaySyncCursor('a', fourth)).toEqual({ forwardSince: 200, backwardUntil: 150 });
  expect(await getRelaySyncCursor('b', third)).toEqual({ forwardSince: null, backwardUntil: null });
});

it('inherits the smallest forward watermark when existing relays have completed deep history', async () => {
  await setForwardSince('a', first, 200);
  await setBackwardUntil('a', first, 0);
  await setForwardSince('a', second, 100);
  await setBackwardUntil('a', second, 0);
  const third = 'wss://third.example';
  configureSyncRelays('a', [first, second, third]);
  expect(await getRelaySyncCursor('a', third)).toEqual({ forwardSince: 100, backwardUntil: 0 });
  await setForwardSince('a', third, 250);
  configureSyncRelays('a', [first, second]);
  configureSyncRelays('a', [first, second, third]);
  expect(await getRelaySyncCursor('a', third)).toEqual({ forwardSince: 250, backwardUntil: 0 });
});

it('prefers configured relay coverage and can inherit stored coverage when replacing every relay', async () => {
  await setForwardSince('a', first, 200);
  await setBackwardUntil('a', first, 0);
  await setForwardSince('a', second, 50);
  await setBackwardUntil('a', second, 0);
  const third = 'wss://third.example';
  configureSyncRelays('a', [first, third]);
  expect(await getRelaySyncCursor('a', third)).toEqual({ forwardSince: 200, backwardUntil: 0 });
  const fourth = 'wss://fourth.example';
  configureSyncRelays('a', [fourth]);
  expect(await getRelaySyncCursor('a', fourth)).toEqual({ forwardSince: 50, backwardUntil: 0 });
});


it('preserves unknown frontiers when the least-covered relay has not completed its first page', async () => {
  await setForwardSince('a', first, 200);
  await setBackwardUntil('a', first, 0);
  await setForwardSince('a', second, 100);
  const third = 'wss://third.example';
  configureSyncRelays('a', [first, second, third]);
  expect(await getRelaySyncCursor('a', third)).toEqual({ forwardSince: 100, backwardUntil: null });
});
