import { normalizeDesktopDeepLink } from '../desktop-deep-link';

describe('normalizeDesktopDeepLink', () => {
  it('maps host-style and path-style links to routes', () => {
    expect(normalizeDesktopDeepLink('walkietalkie://chat/abc?reply=1')).toBe('/chat/abc?reply=1');
    expect(normalizeDesktopDeepLink('walkietalkie:///welcome')).toBe('/welcome');
    expect(normalizeDesktopDeepLink('walkietalkie-dev://chat/abc?reply=1')).toBe('/chat/abc?reply=1');
  });

  it('rejects other schemes and unsafe route segments', () => {
    expect(normalizeDesktopDeepLink('https://example.com/chat/abc')).toBeNull();
    expect(normalizeDesktopDeepLink('walkietalkie://chat/%2E%2E/settings')).toBeNull();
    expect(normalizeDesktopDeepLink('walkietalkie://chat/a%2Fb')).toBeNull();
    expect(normalizeDesktopDeepLink('walkietalkie://chat/a%5Cb')).toBeNull();
    expect(normalizeDesktopDeepLink('walkietalkie-dev://chat/%2E%2E/settings')).toBeNull();
  });

  it('rejects fragments, credentials, and oversized payloads', () => {
    expect(normalizeDesktopDeepLink('walkietalkie://chat/abc#fragment')).toBeNull();
    expect(normalizeDesktopDeepLink('walkietalkie://user@example.com/chat')).toBeNull();
    expect(normalizeDesktopDeepLink(`walkietalkie://chat/${'a'.repeat(9000)}`)).toBeNull();
  });
});
