import {
  clearAppDiagnostics,
  exportAppErrorDiagnostics,
  readAppDiagnostics,
  recordAppDiagnostic,
  recordAppError,
  type AppErrorContext,
} from '../app-error-diagnostics.service';

const mockFiles = new Map<string, string>();

jest.mock('@/platform', () => ({
  platform: {
    fileSystem: {
      documentDirectoryUri: jest.fn(async () => 'file:///documents/'),
      cacheDirectoryUri: jest.fn(async () => 'file:///cache/'),
      makeDirectory: jest.fn(async () => {}),
      stat: jest.fn(async (uri: string) => ({
        exists: mockFiles.has(uri),
        isDirectory: false,
        size: mockFiles.get(uri)?.length ?? null,
        creationTime: null,
        modificationTime: null,
      })),
      readText: jest.fn(async (uri: string) => {
        const value = mockFiles.get(uri);
        if (value === undefined) throw new Error('missing');
        return value;
      }),
      writeText: jest.fn(async (uri: string, value: string) => {
        mockFiles.set(uri, value);
      }),
      delete: jest.fn(async (uri: string) => {
        mockFiles.delete(uri);
      }),
    },
  },
}));

const context: AppErrorContext = {
  errorName: 'TypeError',
  stack: [
    'TypeError: private message content',
    '    at render (https://relay.example/path?npub=npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq)',
    `    at signer (bunker://${'b'.repeat(64)}?secret=private-value)`,
    `    at open (/Users/person/project/src/app/chat.tsx:${'a'.repeat(64)})`,
    '    at dependency (/Users/person/project/node_modules/package/index.js:12:3)',
    '    at windows (C:\\Users\\person\\project\\src\\app\\chat.tsx:4:2)',
  ].join('\n'),
  route: '(app)/chat/[key]',
  appVersion: '1.2.3',
  build: '42',
  platform: 'android',
  platformVersion: '36',
};

describe('app error diagnostics', () => {
  beforeEach(() => {
    mockFiles.clear();
  });

  it('stores only bounded, privacy-filtered diagnostic fields', async () => {
    await expect(recordAppError(context)).resolves.toBe(1);
    await expect(recordAppError(context)).resolves.toBe(2);

    const exported = await exportAppErrorDiagnostics();
    expect(exported).toBe('file:///cache/walkie-talkie-diagnostics.json');
    const contents = mockFiles.get(exported!);
    expect(contents).toBeDefined();
    expect(contents).not.toContain('private message content');
    expect(contents).not.toContain('relay.example');
    expect(contents).not.toContain('npub1');
    expect(contents).not.toContain('a'.repeat(64));
    expect(contents).not.toContain('b'.repeat(64));
    expect(contents).not.toContain('private-value');
    expect(contents).not.toContain('/Users/person');
    expect(contents).not.toContain('C:\\Users\\person');

    const journal = JSON.parse(contents!) as { entries: AppErrorContext[] };
    expect(journal.entries).toHaveLength(2);
    expect(journal.entries[0]).toMatchObject({
      errorName: 'TypeError',
      route: '(app)/chat/[key]',
      appVersion: '1.2.3',
      build: '42',
      platform: 'android',
      platformVersion: '36',
    });
  });

  it('keeps only the latest one hundred entries', async () => {
    for (let index = 0; index < 102; index += 1) {
      await recordAppError({ ...context, route: `(app)/chat/[key]/${index}` });
    }

    const exported = await exportAppErrorDiagnostics();
    const journal = JSON.parse(mockFiles.get(exported!)!) as { entries: AppErrorContext[] };
    expect(journal.entries).toHaveLength(100);
    expect(journal.entries[0].route).toBe('(app)/chat/[key]/2');
    expect(journal.entries.at(-1)?.route).toBe('(app)/chat/[key]/101');
  });

  it('records lifecycle events without retaining signer secrets or identifiers', async () => {
    await recordAppDiagnostic({
      level: 'error',
      area: 'remote signing',
      code: 'bunker failed',
      detail: `bunker://${'a'.repeat(64)}?relay=wss://relay.example&secret=private-value token=abc`,
    });

    const entries = await readAppDiagnostics();
    expect(entries).toEqual([expect.objectContaining({
      level: 'error',
      area: 'remote_signing',
      code: 'bunker_failed',
    })]);
    expect(entries[0].detail).not.toContain('relay.example');
    expect(entries[0].detail).not.toContain('private-value');
    expect(entries[0].detail).not.toContain('a'.repeat(64));
  });

  it('clears the local journal', async () => {
    await recordAppDiagnostic({ level: 'info', area: 'app', code: 'started' });
    await clearAppDiagnostics();
    await expect(readAppDiagnostics()).resolves.toEqual([]);
  });

  it('fails closed when persistent storage is unavailable', async () => {
    const { platform } = jest.requireMock('@/platform') as {
      platform: { fileSystem: { documentDirectoryUri: jest.Mock } };
    };
    platform.fileSystem.documentDirectoryUri
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await expect(recordAppError(context)).resolves.toBe(1);
    await expect(exportAppErrorDiagnostics()).resolves.toBeNull();
  });
});
