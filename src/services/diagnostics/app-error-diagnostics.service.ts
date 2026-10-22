import { platform } from '@/platform';

const DIAGNOSTICS_DIRECTORY = 'diagnostics/';
const JOURNAL_FILE = 'app-errors.json';
const EXPORT_FILE = 'walkie-talkie-diagnostics.json';
const MAX_ENTRIES = 100;
const MAX_JOURNAL_BYTES = 512 * 1024;
const MAX_STACK_LENGTH = 4_000;
const REPEAT_WINDOW_MS = 5 * 60 * 1_000;

export type AppErrorContext = {
  errorName: string;
  stack?: string;
  route: string;
  appVersion: string;
  build: string;
  platform: string;
  platformVersion: string;
};

type AppErrorEntry = AppErrorContext & {
  occurredAt: number;
};

export type AppDiagnosticLevel = 'info' | 'warning' | 'error';

export type AppDiagnosticEvent = {
  level: AppDiagnosticLevel;
  area: string;
  code: string;
  detail?: string;
};

type AppDiagnosticEventEntry = AppDiagnosticEvent & {
  kind: 'event';
  occurredAt: number;
};

export type AppDiagnosticLogEntry = AppDiagnosticEvent & {
  occurredAt: number;
};

type AppErrorJournal = {
  version: 1;
  entries: (AppErrorEntry | AppDiagnosticEventEntry)[];
};

let writeQueue: Promise<void> = Promise.resolve();

function safeToken(value: string, fallback: string, maxLength = 120): string {
  const normalized = value.replace(/[^a-zA-Z0-9_.:/()[\]-]/g, '_').slice(0, maxLength);
  return normalized || fallback;
}

function sanitizeStack(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  const frames = stack
    .split('\n')
    .slice(1, 33)
    .map((line) =>
      line
        .replace(/(?:https?|wss?|file|content|bunker|nostrconnect|psstpsst(?:-dev)?):[^\s)]+/gi, '[uri]')
        .replace(/\b(?:npub|nsec|nprofile|nevent|note)1[023456789acdefghjklmnpqrstuvwxyz]+\b/gi, '[nostr]')
        .replace(/\b[0-9a-f]{64}\b/gi, '[hex64]')
        .replace(/\/[^\s():]+\/(src|modules|desktop|node_modules)\//g, '$1/')
        .replace(/[a-z]:\\[^\s():]+\\(src|modules|desktop|node_modules)\\/gi, '$1/'),
    )
    .join('\n')
    .slice(0, MAX_STACK_LENGTH);
  return frames || undefined;
}

function sanitizeDetail(detail: string | undefined): string | undefined {
  if (!detail) return undefined;
  const sanitized = detail
    .replace(/(?:https?|wss?|file|content|bunker|nostrconnect|psstpsst(?:-dev)?):[^\s)]+/gi, '[uri]')
    .replace(/\b(?:npub|nsec|nprofile|nevent|note)1[023456789acdefghjklmnpqrstuvwxyz]+\b/gi, '[nostr]')
    .replace(/\b[0-9a-f]{64}\b/gi, '[hex64]')
    .replace(/\b(secret|token|private[_-]?key|client[_-]?secret)\s*[=:]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, 1_000);
  return sanitized || undefined;
}

function normalizeContext(context: AppErrorContext): AppErrorContext {
  return {
    errorName: safeToken(context.errorName, 'Error', 80),
    stack: sanitizeStack(context.stack),
    route: safeToken(context.route, 'unknown', 200),
    appVersion: safeToken(context.appVersion, 'unknown', 40),
    build: safeToken(context.build, 'unknown', 40),
    platform: safeToken(context.platform, 'unknown', 40),
    platformVersion: safeToken(context.platformVersion, 'unknown', 80),
  };
}

function isDiagnosticEventEntry(
  entry: Partial<AppErrorEntry & AppDiagnosticEventEntry>,
): entry is AppDiagnosticEventEntry {
  return (
    entry.kind === 'event' &&
    typeof entry.occurredAt === 'number' &&
    Number.isFinite(entry.occurredAt) &&
    (entry.level === 'info' || entry.level === 'warning' || entry.level === 'error') &&
    typeof entry.area === 'string' &&
    typeof entry.code === 'string' &&
    (entry.detail === undefined || typeof entry.detail === 'string')
  );
}

function isEntry(value: unknown): value is AppErrorEntry | AppDiagnosticEventEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<AppErrorEntry & AppDiagnosticEventEntry>;
  if (isDiagnosticEventEntry(entry)) return true;
  return (
    typeof entry.occurredAt === 'number' &&
    Number.isFinite(entry.occurredAt) &&
    typeof entry.errorName === 'string' &&
    typeof entry.route === 'string' &&
    typeof entry.appVersion === 'string' &&
    typeof entry.build === 'string' &&
    typeof entry.platform === 'string' &&
    typeof entry.platformVersion === 'string' &&
    (entry.stack === undefined || typeof entry.stack === 'string')
  );
}

async function diagnosticsDirectory(): Promise<string | null> {
  const root = await platform.fileSystem.documentDirectoryUri();
  if (!root) return null;
  const directory = `${root}${DIAGNOSTICS_DIRECTORY}`;
  await platform.fileSystem.makeDirectory(directory, { intermediates: true, idempotent: true });
  return directory;
}

async function readJournal(directory: string): Promise<AppErrorJournal> {
  const uri = `${directory}${JOURNAL_FILE}`;
  try {
    const stat = await platform.fileSystem.stat(uri);
    if (!stat.exists || stat.size == null || stat.size > MAX_JOURNAL_BYTES) {
      return { version: 1, entries: [] };
    }
    const parsed = JSON.parse(await platform.fileSystem.readText(uri)) as Partial<AppErrorJournal>;
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      return { version: 1, entries: [] };
    }
    return { version: 1, entries: parsed.entries.filter(isEntry).slice(-MAX_ENTRIES) };
  } catch {
    return { version: 1, entries: [] };
  }
}

async function writeJournal(directory: string, journal: AppErrorJournal): Promise<void> {
  await platform.fileSystem.writeText(
    `${directory}${JOURNAL_FILE}`,
    JSON.stringify(journal),
  );
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(task, task);
  writeQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** Persist one privacy-filtered route failure and return its consecutive count. */
export function recordAppError(context: AppErrorContext): Promise<number> {
  return enqueue(async () => {
    const directory = await diagnosticsDirectory();
    if (!directory) return 1;
    const journal = await readJournal(directory);
    const normalized = normalizeContext(context);
    const occurredAt = Date.now();
    const previous = journal.entries.at(-1);
    let consecutive = 1;
    if (
      previous &&
      !('kind' in previous) &&
      previous.errorName === normalized.errorName &&
      previous.route === normalized.route &&
      occurredAt - previous.occurredAt <= REPEAT_WINDOW_MS
    ) {
      for (let index = journal.entries.length - 1; index >= 0; index -= 1) {
        const entry = journal.entries[index];
        if (
          'kind' in entry ||
          entry.errorName !== normalized.errorName ||
          entry.route !== normalized.route ||
          occurredAt - entry.occurredAt > REPEAT_WINDOW_MS
        ) {
          break;
        }
        consecutive += 1;
      }
    }
    journal.entries.push({ ...normalized, occurredAt });
    if (journal.entries.length > MAX_ENTRIES) {
      journal.entries.splice(0, journal.entries.length - MAX_ENTRIES);
    }
    await writeJournal(directory, journal);
    return consecutive;
  }).catch(() => 1);
}

/** Persist one bounded, privacy-filtered lifecycle event for user-visible diagnostics. */
export function recordAppDiagnostic(event: AppDiagnosticEvent): Promise<void> {
  return enqueue(async () => {
    const directory = await diagnosticsDirectory();
    if (!directory) return;
    const journal = await readJournal(directory);
    journal.entries.push({
      kind: 'event',
      occurredAt: Date.now(),
      level: event.level,
      area: safeToken(event.area, 'app', 80),
      code: safeToken(event.code, 'unknown', 120),
      detail: sanitizeDetail(event.detail),
    });
    if (journal.entries.length > MAX_ENTRIES) {
      journal.entries.splice(0, journal.entries.length - MAX_ENTRIES);
    }
    await writeJournal(directory, journal);
  }).catch(() => {});
}

/** Read the local journal in a stable shape suitable for the in-app Logs screen. */
export function readAppDiagnostics(): Promise<AppDiagnosticLogEntry[]> {
  return enqueue(async () => {
    const directory = await diagnosticsDirectory();
    if (!directory) return [];
    const journal = await readJournal(directory);
    return journal.entries.map((entry) => {
      if (isDiagnosticEventEntry(entry)) {
        return {
          occurredAt: entry.occurredAt,
          level: entry.level,
          area: entry.area,
          code: entry.code,
          detail: entry.detail,
        };
      }
      return {
        occurredAt: entry.occurredAt,
        level: 'error' as const,
        area: entry.route,
        code: entry.errorName,
        detail: entry.stack,
      };
    }).reverse();
  }).catch(() => []);
}

/** Remove all locally stored diagnostic entries. */
export function clearAppDiagnostics(): Promise<void> {
  return enqueue(async () => {
    const directory = await diagnosticsDirectory();
    if (!directory) return;
    await platform.fileSystem.delete(`${directory}${JOURNAL_FILE}`, { idempotent: true });
  }).catch(() => {});
}

/** Copy the bounded local journal to an OS-shareable cache file. */
export function exportAppErrorDiagnostics(): Promise<string | null> {
  return enqueue(async () => {
    const directory = await diagnosticsDirectory();
    const cacheRoot = await platform.fileSystem.cacheDirectoryUri();
    if (!directory || !cacheRoot) return null;
    const journal = await readJournal(directory);
    const uri = `${cacheRoot}${EXPORT_FILE}`;
    await platform.fileSystem.writeText(uri, JSON.stringify(journal, null, 2));
    return uri;
  }).catch(() => null);
}
