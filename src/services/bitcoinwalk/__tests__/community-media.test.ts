import { sendCommunityFile } from '../community-media';
import { hasActiveCommunityMembership, sendCommunityMessage } from '../community';
import { uploadPublicCommunityFile } from '@/services/files/blossom.service';
import { prepareAttachmentImage } from '@/services/files/strip-metadata';
import { platform } from '@/platform';
import type { Signer } from '@/services/signer/signer.interface';

jest.mock('@/platform', () => ({ platform: { fileSystem: { stat: jest.fn(), delete: jest.fn() } } }));
jest.mock('../community', () => ({ hasActiveCommunityMembership: jest.fn(), sendCommunityMessage: jest.fn() }));
jest.mock('@/services/files/blossom.service', () => ({ uploadPublicCommunityFile: jest.fn() }));
jest.mock('@/services/files/strip-metadata', () => ({ prepareAttachmentImage: jest.fn() }));
jest.mock('@/services/files/media-server.service', () => ({ loadAccountMediaServers: jest.fn(async () => ['https://media.example']) }));

const account = 'a'.repeat(64);
const signer = { getPublicKey: jest.fn(async () => account) } as unknown as Signer;
const input = { accountPubkey: account, destination: { relay: 'wss://chat.bitcoinwalk.org/', groupId: 'bitcoinwalk-madeira' },
  signer, file: { uri: 'file:///photo.jpg', mime: 'image/jpeg' }, quality: 'optimized' as const };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(signer.getPublicKey).mockResolvedValue(account);
  jest.mocked(hasActiveCommunityMembership).mockResolvedValue(true);
  jest.mocked(platform.fileSystem.stat).mockResolvedValue({ exists: true, isDirectory: false, size: 100,
    creationTime: null, modificationTime: null });
  jest.mocked(platform.fileSystem.delete).mockResolvedValue();
  jest.mocked(prepareAttachmentImage).mockResolvedValue({ uri: 'file:///clean.jpg', width: 20, height: 20 });
  jest.mocked(uploadPublicCommunityFile).mockResolvedValue({ url: 'https://media.example/hash',
    sha256: 'b'.repeat(64), size: 100, server: 'https://media.example' });
});

it('publishes a plain URL through kind 9, using sanitized media and account servers', async () => {
  await sendCommunityFile(input);
  expect(uploadPublicCommunityFile).toHaveBeenCalledWith({ signer, fileUri: 'file:///clean.jpg',
    mime: 'image/jpeg', servers: ['https://media.example'] });
  expect(sendCommunityMessage).toHaveBeenCalledWith(expect.objectContaining({ destination: input.destination,
    content: 'https://media.example/hash?filename=media.jpg', previousEventIds: [] }));
  expect(platform.fileSystem.delete).toHaveBeenCalledWith('file:///clean.jpg', { idempotent: true });
});

it.each(['identity', 'membership'])('rejects %s mismatch before reading or uploading media', async (reason) => {
  if (reason === 'identity') jest.mocked(signer.getPublicKey).mockResolvedValue('c'.repeat(64));
  else jest.mocked(hasActiveCommunityMembership).mockResolvedValue(false);
  await expect(sendCommunityFile(input)).rejects.toThrow('membership');
  expect(platform.fileSystem.stat).not.toHaveBeenCalled();
  expect(uploadPublicCommunityFile).not.toHaveBeenCalled();
});

it('rejects an oversized source before decoding or preparing it', async () => {
  jest.mocked(platform.fileSystem.stat).mockResolvedValue({ exists: true, isDirectory: false,
    size: 20 * 1024 * 1024 + 1, creationTime: null, modificationTime: null });
  await expect(sendCommunityFile(input)).rejects.toThrow('20 MiB');
  expect(prepareAttachmentImage).not.toHaveBeenCalled();
});

it('does not fall back to the original photo when metadata stripping fails', async () => {
  jest.mocked(prepareAttachmentImage).mockRejectedValue(new Error('encoding failed'));
  await expect(sendCommunityFile(input)).rejects.toThrow('encoding failed');
  expect(uploadPublicCommunityFile).not.toHaveBeenCalled();
});

it('keeps audio MIME and supplies a playable URL, without private encryption metadata', async () => {
  jest.mocked(prepareAttachmentImage).mockResolvedValue(null);
  await sendCommunityFile({ ...input, file: { uri: 'file:///voice.m4a', mime: 'audio/mp4' } });
  expect(uploadPublicCommunityFile).toHaveBeenCalledWith(expect.objectContaining({ mime: 'audio/mp4' }));
  expect(sendCommunityMessage).toHaveBeenCalledWith(expect.objectContaining({
    content: 'https://media.example/hash?filename=media.m4a' }));
  expect(platform.fileSystem.delete).not.toHaveBeenCalled();
});

it('cleans prepared media on publication failure without deleting the original', async () => {
  jest.mocked(sendCommunityMessage).mockRejectedValueOnce(new Error('relay unavailable'));
  await expect(sendCommunityFile(input)).rejects.toThrow('relay unavailable');
  expect(platform.fileSystem.delete).toHaveBeenCalledTimes(1);
  expect(platform.fileSystem.delete).toHaveBeenCalledWith('file:///clean.jpg', { idempotent: true });
});
