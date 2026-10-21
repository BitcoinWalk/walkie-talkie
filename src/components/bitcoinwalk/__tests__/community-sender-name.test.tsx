import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { CommunitySenderName } from '../CommunitySenderName';

let mockProfile: { displayName?: string; name?: string } | null = null;
let mockPetname: string | null = null;
jest.mock('@/hooks/use-profile', () => ({ useProfile: () => mockProfile }));
jest.mock('@/hooks/use-contacts', () => ({ useContact: () => ({ petname: mockPetname }) }));
jest.mock('@/stores/active-account.store', () => ({
  useActiveAccount: (selector: (state: { activePubkey: string }) => unknown) =>
    selector({ activePubkey: 'b'.repeat(64) }),
}));
jest.mock('@/components/common/AppText', () => ({
  AppText: jest.requireActual('react-native').Text,
}));

describe('community sender identity', () => {
  let renderer: ReactTestRenderer;
  afterEach(() => { act(() => renderer.unmount()); });

  it.each([
    [{ displayName: 'Alice Walker', name: 'alice' }, null, 'Alice Walker'],
    [{ name: 'alice' }, null, 'alice'],
    [{ displayName: 'Alice Walker' }, 'Walking friend', 'Walking friend'],
    [null, null, 'npub1'],
  ] as const)('uses shared name precedence and a public-key fallback (%j)', (profile, petname, expected) => {
    mockProfile = profile;
    mockPetname = petname;
    act(() => { renderer = create(<CommunitySenderName pubkey={'a'.repeat(64)} />); });
    expect(JSON.stringify(renderer.toJSON())).toContain(expected);
  });
});
