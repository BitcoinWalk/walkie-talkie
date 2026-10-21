import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@/lib/nostr/keys';
import { platform } from '@/platform';
import type { Signer } from '@/services/signer/signer.interface';
import { uploadPublicCommunityFile } from '../blossom.service';

jest.mock('@/platform', () => ({ platform: { fileSystem: {
  stat: jest.fn(), readBase64: jest.fn(), uploadFile: jest.fn(),
} } }));

const signer = { signEvent: jest.fn(async () => ({ tags: [] })) } as unknown as Signer;
const hash = bytesToHex(sha256(new Uint8Array([1, 2, 3])));
const options = { signer, fileUri: 'file:///voice.m4a', mime: 'audio/mp4', servers: ['https://media.example'] };
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(platform.fileSystem.stat).mockResolvedValue({ exists: true, isDirectory: false,
    size: 3, creationTime: null, modificationTime: null });
  jest.mocked(platform.fileSystem.readBase64).mockResolvedValue('AQID');
  jest.mocked(platform.fileSystem.uploadFile).mockResolvedValue({ status: 200,
    body: JSON.stringify({ url: `https://media.example/${hash}`, sha256: hash, size: 3 }) });
});

it('uploads explicit public bytes with the original MIME and verifies the descriptor', async () => {
  await expect(uploadPublicCommunityFile(options)).resolves.toEqual(expect.objectContaining({ sha256: hash, size: 3 }));
  expect(platform.fileSystem.uploadFile).toHaveBeenCalledWith('https://media.example/upload', options.fileUri,
    expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'audio/mp4' }) }));
  expect(signer.signEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: 24242,
    content: 'Upload public community file', tags: expect.arrayContaining([['x', hash], ['size', '3']]) }));
});

it.each([
  { url: 'http://media.example/file', sha256: hash, size: 3 },
  { url: 'https://user:password@media.example/file', sha256: hash, size: 3 },
  { url: 'https://media.example/file', sha256: 'b'.repeat(64), size: 3 },
  { url: 'https://media.example/file', sha256: hash, size: 4 },
])('rejects a malformed or mismatched descriptor (%j)', async (descriptor) => {
  jest.mocked(platform.fileSystem.uploadFile).mockResolvedValue({ status: 200, body: JSON.stringify(descriptor) });
  await expect(uploadPublicCommunityFile(options)).rejects.toThrow('descriptor');
});

it('bounds reads before loading a large file into JS memory', async () => {
  jest.mocked(platform.fileSystem.stat).mockResolvedValue({ exists: true, isDirectory: false,
    size: 20 * 1024 * 1024 + 1, creationTime: null, modificationTime: null });
  await expect(uploadPublicCommunityFile(options)).rejects.toThrow('20 MiB');
  expect(platform.fileSystem.readBase64).not.toHaveBeenCalled();
  expect(signer.signEvent).not.toHaveBeenCalled();
});

it('rejects a source changed between stat and read', async () => {
  jest.mocked(platform.fileSystem.readBase64).mockResolvedValue('AQI=');
  await expect(uploadPublicCommunityFile(options)).rejects.toThrow('changed');
  expect(platform.fileSystem.uploadFile).not.toHaveBeenCalled();
});
