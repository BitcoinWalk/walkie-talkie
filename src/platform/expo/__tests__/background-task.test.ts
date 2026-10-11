type WrappedTask = () => Promise<number>;

let mockIsIos = true;
let mockWrappedTask: WrappedTask | null = null;
const mockDefineTask = jest.fn((_name: string, task: WrappedTask) => {
  mockWrappedTask = task;
});
const mockRegisterTask = jest.fn(async () => {});
const mockUnregisterTask = jest.fn(async () => {});

jest.mock('@/lib/platform', () => ({ get IS_IOS() { return mockIsIos; } }));
jest.mock('expo-task-manager', () => ({ defineTask: mockDefineTask }));
jest.mock('expo-background-task', () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  registerTaskAsync: mockRegisterTask,
  unregisterTaskAsync: mockUnregisterTask,
}));

describe('Expo background-task adapter', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockWrappedTask = null;
  });

  function loadAdapter(ios: boolean) {
    mockIsIos = ios;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('../background-task') as typeof import('../background-task')).backgroundTaskAdapter;
  }

  it('does not define, register, or unregister periodic workers on iOS', async () => {
    const adapter = loadAdapter(true);
    adapter.defineTasks(['notification-poll'], async () => {});
    await adapter.register(15);
    await adapter.unregister();
    expect(mockDefineTask).not.toHaveBeenCalled();
    expect(mockRegisterTask).not.toHaveBeenCalled();
    expect(mockUnregisterTask).not.toHaveBeenCalled();
  });

  it('retains Android polling and removes legacy schedules', async () => {
    const adapter = loadAdapter(false);
    const run = jest.fn(async ({ signal }: { signal: AbortSignal }) => {
      expect(signal.aborted).toBe(false);
    });
    adapter.defineTasks(['notification-poll', 'legacy-poll'], run);
    await adapter.register(15);
    expect(mockUnregisterTask).toHaveBeenCalledWith('legacy-poll');
    expect(mockRegisterTask).toHaveBeenCalledWith('notification-poll', { minimumInterval: 15 });
    await expect(mockWrappedTask!()).resolves.toBe(1);
    expect(run).toHaveBeenCalledTimes(1);
    await adapter.unregister();
    expect(mockUnregisterTask).toHaveBeenCalledWith('notification-poll');
  });

  it('reports failed Android runs to the scheduler', async () => {
    const adapter = loadAdapter(false);
    adapter.defineTasks(['notification-poll'], async () => { throw new Error('offline'); });
    await expect(mockWrappedTask!()).resolves.toBe(2);
  });
});
