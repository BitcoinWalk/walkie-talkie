import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { CommunityComposer } from '../CommunityComposer';
import { ChatInput } from '@/components/chat/ChatInput';
import { AttachmentSendConfirmation } from '@/components/chat/AttachmentSendConfirmation';

const mockConfirm = jest.fn();
const mockDelete = jest.fn();
const mockCamera = jest.fn();
const mockLibrary = jest.fn();
const mockDocuments = jest.fn();
const mockSend = jest.fn();
const mockSendFile = jest.fn();
const mockBeginRequest = jest.fn();
const mockPush = jest.fn();
const mockDestroy = jest.fn();

jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: (...args: unknown[]) => mockCamera(...args),
  launchImageLibraryAsync: (...args: unknown[]) => mockLibrary(...args),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: (...args: unknown[]) => mockDocuments(...args) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/components/chat/ChatInput', () => ({ ChatInput: () => null }));
jest.mock('@/components/chat/AttachmentSendConfirmation', () => ({ AttachmentSendConfirmation: () => null }));
jest.mock('@/components/chat/chat-composer-panel-context', () => ({
  ChatComposerPanelProvider: ({ children }: { children: React.ReactNode }) => children,
  ChatComposerPanelBackHandler: () => null,
}));
jest.mock('@/components/common/AppText', () => ({ AppText: () => null }));
jest.mock('@/components/common/AppButton', () => ({ AppButton: () => null }));
jest.mock('@/lib/platform', () => ({ IS_IOS: false }));
jest.mock('@/platform', () => ({ platform: {
  confirmationDialog: { confirm: (...args: unknown[]) => mockConfirm(...args) },
  fileSystem: { delete: (...args: unknown[]) => mockDelete(...args) },
} }));
jest.mock('@/services/account/account.service', () => ({ buildSigner: async () => ({ destroy: mockDestroy }) }));
jest.mock('@/services/bitcoinwalk/community', () => ({ sendCommunityMessage: (...args: unknown[]) => mockSend(...args) }));
jest.mock('@/services/bitcoinwalk/community-media', () => ({ sendCommunityFile: (...args: unknown[]) => mockSendFile(...args) }));
jest.mock('@/services/bitcoinwalk/community-payment-request', () => ({ beginCommunityPaymentRequest: (...args: unknown[]) => mockBeginRequest(...args) }));

const account = 'a'.repeat(64);
const destination = { relay: 'wss://chat.bitcoinwalk.org/', groupId: 'bitcoinwalk-madeira' };
const voice = { uri: 'file:///voice.m4a', mime: 'audio/mp4', durationSec: 2, waveform: [1, 2] };
let renderer: ReactTestRenderer;
let sent: jest.Mock;
const composer = () => renderer.root.findByType(ChatInput).props;
const preview = () => renderer.root.findByType(AttachmentSendConfirmation).props;
async function flush(action: () => void) {
  await act(async () => { action(); await jest.runAllTimersAsync(); });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockConfirm.mockResolvedValue(true);
  mockDelete.mockResolvedValue(undefined);
  mockCamera.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///photo.jpg', mimeType: 'image/jpeg' }] });
  mockLibrary.mockResolvedValue({ canceled: true });
  mockDocuments.mockResolvedValue({ canceled: true });
  mockSend.mockResolvedValue({ id: 'event' });
  mockSendFile.mockResolvedValue({ id: 'file-event' });
  mockBeginRequest.mockResolvedValue('opaque-id');
  sent = jest.fn();
  act(() => { renderer = create(<CommunityComposer accountPubkey={account} destination={destination} onSent={sent} />); });
});
afterEach(() => { act(() => renderer.unmount()); jest.useRealTimers(); });

it('reuses the DM composer with every attachment option, voice and an isolated draft key', () => {
  expect(composer().attachmentSources).toEqual(['camera', 'library', 'file', 'invoice', 'card']);
  expect(composer().onSendVoice).toEqual(expect.any(Function));
  expect(composer().draftKey).toContain('nip29:');
  expect(composer().maxLength).toBe(4_000);
});

it('requires consent before launching a camera or creating a payment request', async () => {
  mockConfirm.mockResolvedValue(false);
  await flush(() => composer().onPickAttachment('camera'));
  await flush(() => composer().onPickAttachment('invoice'));
  expect(mockCamera).not.toHaveBeenCalled();
  expect(mockBeginRequest).not.toHaveBeenCalled();
  expect(mockSendFile).not.toHaveBeenCalled();
});

it('previews camera media and publishes only after explicit send', async () => {
  await flush(() => composer().onPickAttachment('camera'));
  expect(mockSendFile).not.toHaveBeenCalled();
  expect(preview().visible).toBe(true);
  await flush(() => preview().onConfirm('optimized', ''));
  expect(mockSendFile).toHaveBeenCalledWith(expect.objectContaining({ accountPubkey: account,
    destination, file: expect.objectContaining({ uri: 'file:///photo.jpg' }), quality: 'optimized' }));
  expect(sent).toHaveBeenCalledWith({ id: 'file-event' });
});

it.each(['library', 'file'])('opens the existing %s picker without sending on cancellation', async (source) => {
  await flush(() => composer().onPickAttachment(source));
  expect(source === 'library' ? mockLibrary : mockDocuments).toHaveBeenCalled();
  expect(mockSendFile).not.toHaveBeenCalled();
});

it('opens the wallet receive task with only an opaque request identifier', async () => {
  await flush(() => composer().onPickAttachment('invoice'));
  expect(mockBeginRequest).toHaveBeenCalledWith(account, destination);
  expect(mockPush).toHaveBeenCalledWith('/wallet-receive?communityRequest=opaque-id');
});

it('shares the same public identity card content as DMs', async () => {
  await flush(() => composer().onPickAttachment('card'));
  expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ destination,
    content: expect.stringMatching(/^nostr:npub1/) }));
});

it('discards a declined recording without uploading it', async () => {
  mockConfirm.mockResolvedValue(false);
  await flush(() => composer().onSendVoice(voice));
  expect(mockSendFile).not.toHaveBeenCalled();
  expect(mockDelete).toHaveBeenCalledWith(voice.uri, { idempotent: true });
});

it('uploads voice through the community transport and cleans the temporary recording', async () => {
  await flush(() => composer().onSendVoice(voice));
  expect(mockSendFile).toHaveBeenCalledWith(expect.objectContaining({
    file: { uri: voice.uri, mime: voice.mime }, quality: 'original' }));
  expect(mockDelete).toHaveBeenCalledWith(voice.uri, { idempotent: true });
});

it('retains a failed recording for retry and cleans it if cancelled', async () => {
  mockSendFile.mockRejectedValueOnce(new Error('offline'));
  await flush(() => composer().onSendVoice(voice));
  expect(mockDelete).not.toHaveBeenCalled();
  expect(preview().visible).toBe(true);
  await flush(() => preview().onClose());
  expect(mockDelete).toHaveBeenCalledWith(voice.uri, { idempotent: true });
});

it('a partial batch retry contains only the unpublished files', async () => {
  mockDocuments.mockResolvedValue({ canceled: false,
    assets: [{ uri: 'file:///a.pdf', name: 'a.pdf' }, { uri: 'file:///b.pdf', name: 'b.pdf' }] });
  await flush(() => composer().onPickAttachment('file'));
  mockSendFile.mockResolvedValueOnce({ id: 'a' }).mockRejectedValueOnce(new Error('offline'));
  await flush(() => preview().onConfirm('original', ''));
  expect(preview().files.map((file: { source: { uri: string } }) => file.source.uri)).toEqual(['file:///b.pdf']);
});

it('cleans a retained recording when its conversation is left', async () => {
  mockSendFile.mockRejectedValueOnce(new Error('offline'));
  await flush(() => composer().onSendVoice(voice));
  expect(mockDelete).not.toHaveBeenCalled();
  act(() => renderer.unmount());
  expect(mockDelete).toHaveBeenCalledWith(voice.uri, { idempotent: true });
});
