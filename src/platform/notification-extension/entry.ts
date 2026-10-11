import { createAsyncDatabase } from '../create-async-database';
import type { PlatformAdapters, SqliteDriver, SqliteExecutor } from '../ports';
import { initPlatformAdapters } from './registry';

/** Native I/O runs on the extension's serial worker, never the app's JS thread. */
declare const __nativeCall: (method: string, args: unknown[], callback: (error: string | null, value: unknown) => void) => void;
declare const __complete: (result: string) => void;
declare const __locale: string;
declare const __deadlineTime: number;
declare const __receiveContext: { userPresent: boolean; activeConversation?: { accountPubkey: string; conversationKey: string } };

function call<T>(method: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => __nativeCall(method, args,
    (error, value) => error ? reject(new Error(error)) : resolve(value as T)));
}

function executor(): SqliteExecutor {
  return {
    execute: (sql, params, method) => call('sql', sql, params, method),
    async transaction(task) {
      const name = `nested_${Math.random().toString(16).slice(2)}`;
      await call('exec', `SAVEPOINT ${name}`);
      try {
        const value = await task(executor());
        await call('exec', `RELEASE SAVEPOINT ${name}`);
        return value;
      } catch (error) {
        await call('exec', `ROLLBACK TO SAVEPOINT ${name}`);
        await call('exec', `RELEASE SAVEPOINT ${name}`);
        throw error;
      }
    },
  };
}

let tail: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const pending = tail.then(task);
  tail = pending.catch(() => {});
  return pending;
}
const database: SqliteDriver = {
  drizzle: (schema) => createAsyncDatabase(database, schema),
  execute: (sql, params, method) => serialized(() => call('sql', sql, params, method)),
  transaction: (task) => serialized(async () => {
    await call('exec', 'BEGIN IMMEDIATE');
    try {
      const value = await task(executor());
      await call('exec', 'COMMIT');
      return value;
    } catch (error) {
      await call('exec', 'ROLLBACK');
      throw error;
    }
  }),
  exec: (sql) => serialized(() => call('exec', sql)),
  rawQuery: (sql, params = []) => serialized(() => call('query', sql, params)),
  async *rawQueryEach(sql, params = []) {
    // Intake uses bounded queries; extension jobs never export histories.
    for (const row of await database.rawQuery(sql, params)) yield row as never;
  },
  runBatch: (sql, rows) => database.transaction(async (tx) => {
    for (const row of rows) await tx.execute(sql, row, 'run');
  }),
  addChangeListener: () => () => {},
};

const unsupported = new Proxy({}, {
  get: (_target, method) => {
    if (method === 'isAvailable') return () => false;
    if (String(method).startsWith('add')) return () => () => {};
    return () => Promise.reject(new Error(`Unavailable in notification extension: ${String(method)}`));
  },
});
const adapters = new Proxy({
  database,
  appState: { currentState: () => 'extension', addChangeListener: () => () => {} },
  notifications: { isAvailable: () => false, shouldNotifyNow: () => true, addUserReturnedListener: () => () => {} },
  localization: { preferredLanguageTag: () => __locale },
  secureStorage: {
    accessStatus: async () => 'available',
    getItem: (key: string) => call('keyGet', key),
    setItem: (key: string, value: string) => call('keySet', key, value),
    deleteItem: (key: string) => call('keyDelete', key),
  },
  cryptoAccelerator: {
    isAvailable: () => false,
    getNip44ConversationKey: async () => null,
    verifySchnorr: () => null,
  },
  deviceCrypto: {
    randomUUID: () => call('uuid'),
    sha256Hex: (bytes: Uint8Array) => call('sha256', Array.from(bytes)),
  },
  networkState: {
    getState: async () => ({ isConnected: true, isInternetReachable: true }),
    addStateListener: () => () => {},
  },
}, { get: (target, key) => target[key as keyof typeof target] ?? unsupported });
initPlatformAdapters(adapters as unknown as PlatformAdapters);

export async function receive(serializedPayload: string): Promise<void> {
  try {
    const payload: unknown = JSON.parse(serializedPayload);
    // Dynamic import ensures platform setup happens before db/client is evaluated.
    const [{ processApnsGiftWrap }, { default: i18n, LANGUAGES }, { getDevicePreference }] = await Promise.all([
      import('@/services/notifications/apns-intake'),
      import('@/i18n'),
      import('@/services/preferences/device-preferences.service'),
    ]);
    const language = await getDevicePreference('language.preference');
    if (language && LANGUAGES.some((candidate) => candidate === language)) await i18n.changeLanguage(language);
    const result = await processApnsGiftWrap(payload, {
      userPresent: __receiveContext.userPresent,
      activeConversation: __receiveContext.activeConversation ?? null,
      isCurrent: () => Date.now() < __deadlineTime,
    });
    __complete(JSON.stringify({ status: result ? 'notify' : 'suppress', ...result }));
  } catch {
    // Do not log payloads, credentials or plaintext; native timeout retains the generic alert.
    __complete(JSON.stringify({ status: 'retry' }));
  }
}
