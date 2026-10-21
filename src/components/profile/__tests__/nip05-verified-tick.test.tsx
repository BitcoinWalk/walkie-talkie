import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { VerifiedCheck } from '@solar-icons/react-native/category/money/Linear/VerifiedCheck';
import { queryNip05Profile } from '@/lib/nostr/nip05';
import { Nip05VerifiedTick } from '../Nip05VerifiedTick';

jest.mock(
  '@solar-icons/react-native/category/money/Linear/VerifiedCheck',
  () => ({ VerifiedCheck: () => null }),
  { virtual: true },
);
jest.mock('@/theme', () => ({
  typography: { caption: { lineHeight: 20 } },
  useThemeColors: () => ({ success: 'green' }),
}));
jest.mock('@/lib/nostr/nip05', () => ({
  normalizeNip05Identifier: (value: string) => value.includes('@') ? value : null,
  queryNip05Profile: jest.fn(),
}));

describe('NIP-05 verification tick', () => {
  let renderer: ReactTestRenderer | undefined;
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => { act(() => renderer?.unmount()); renderer = undefined; jest.useRealTimers(); });

  it('shows only for the matched account and removes the tick immediately on edit', async () => {
    jest.mocked(queryNip05Profile).mockResolvedValue({ identifier: 'city@example.org', pubkey: 'abc' });
    act(() => { renderer = create(<Nip05VerifiedTick identifier="city@example.org" pubkey="abc" />); });
    expect(renderer!.root.findAllByType(VerifiedCheck)).toHaveLength(0);
    await act(async () => { jest.advanceTimersByTime(350); });
    expect(renderer!.root.findAllByType(VerifiedCheck)).toHaveLength(1);
    act(() => { renderer!.update(<Nip05VerifiedTick identifier="other@example.org" pubkey="abc" />); });
    expect(renderer!.root.findAllByType(VerifiedCheck)).toHaveLength(0);
    jest.mocked(queryNip05Profile).mockResolvedValue({ identifier: 'other@example.org', pubkey: 'def' });
    await act(async () => { jest.advanceTimersByTime(350); });
    expect(renderer!.root.findAllByType(VerifiedCheck)).toHaveLength(0);
  });

  it('ignores a late result after switching accounts', async () => {
    let resolve!: (value: { identifier: string; pubkey: string }) => void;
    jest.mocked(queryNip05Profile).mockReturnValue(new Promise((done) => { resolve = done; }));
    act(() => { renderer = create(<Nip05VerifiedTick identifier="city@example.org" pubkey="abc" />); });
    act(() => { jest.advanceTimersByTime(350); });
    act(() => { renderer!.update(<Nip05VerifiedTick identifier="city@example.org" pubkey="def" />); });
    await act(async () => { resolve({ identifier: 'city@example.org', pubkey: 'abc' }); });
    expect(renderer!.root.findAllByType(VerifiedCheck)).toHaveLength(0);
  });
});
