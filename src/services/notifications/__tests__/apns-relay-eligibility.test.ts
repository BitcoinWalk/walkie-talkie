import { hasApnsRelay } from '../apns-relay-eligibility';

jest.mock('../push-api', () => ({ APNS_RELAY_URL: 'wss://relay.psstpsst.chat/' }));

describe('APNs inbox prerequisite', () => {
  it.each(['wss://relay.psstpsst.chat', 'wss://relay.psstpsst.chat/', 'wss://RELAY.PSSTPSST.CHAT:443/'])(
    'accepts the normalized deployed relay %s', (relay) => { expect(hasApnsRelay([relay])).toBe(true); },
  );
  it.each(['ws://relay.psstpsst.chat/', 'wss://relay.psstpsst.chat/other', 'wss://relay.psstpsst.chat/?a=1', 'wss://relay.psstpsst.chat.evil/', 'not a url'])(
    'rejects a different relay %s', (relay) => { expect(hasApnsRelay([relay])).toBe(false); },
  );
  it('rejects an empty inbox list', () => { expect(hasApnsRelay([])).toBe(false); });
});
