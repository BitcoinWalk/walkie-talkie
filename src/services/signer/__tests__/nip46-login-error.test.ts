import { BunkerLoginError, classifyBunkerLoginError } from '../nip46-login-error';
import { Nip46TimeoutError } from '../nip46-timeout';

describe('bunker login failure feedback', () => {
  test.each(['invalid secret', 'no secret', 'already connected', 'secret not in use'])(
    'identifies an Amber connection token failure: %s', (error) => {
      expect(classifyBunkerLoginError(error)).toBe('expired_link');
    },
  );

  test('distinguishes approval, transport, timeout and storage failures', () => {
    expect(classifyBunkerLoginError('user rejected')).toBe('rejected');
    expect(classifyBunkerLoginError('Amber is locked. Unlock your device and try again.')).toBe('signer_locked');
    expect(classifyBunkerLoginError(new AggregateError([]))).toBe('relay_unavailable');
    expect(classifyBunkerLoginError(new Nip46TimeoutError('connection', 60_000))).toBe('timeout');
    expect(classifyBunkerLoginError(new BunkerLoginError('save_failed'))).toBe('save_failed');
  });

  test('does not expose arbitrary signer text or link credentials', () => {
    const raw = 'bunker://private-endpoint?secret=private-token';
    const failure = new BunkerLoginError(classifyBunkerLoginError(raw));
    expect(failure.code).toBe('connection_failed');
    expect(failure.message).not.toContain(raw);
    expect(failure.message).not.toContain('private-token');
  });
});
