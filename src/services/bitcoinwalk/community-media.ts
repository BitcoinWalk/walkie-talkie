import type { ImageSendQuality } from '@/lib/attachments/image-quality';
import { platform } from '@/platform';
import { uploadPublicCommunityFile } from '@/services/files/blossom.service';
import { loadAccountMediaServers } from '@/services/files/media-server.service';
import { prepareAttachmentImage } from '@/services/files/strip-metadata';
import type { Signer } from '@/services/signer/signer.interface';
import { hasActiveCommunityMembership, sendCommunityMessage,
  type BitcoinWalkCommunityDestination } from './community';

/** The caller must obtain explicit public-upload consent before calling. */
export async function sendCommunityFile(input: {
  accountPubkey: string;
  destination: BitcoinWalkCommunityDestination;
  signer: Signer;
  file: { uri: string; mime: string; name?: string };
  quality: ImageSendQuality;
}) {
  if (await input.signer.getPublicKey() !== input.accountPubkey ||
      !await hasActiveCommunityMembership(input.destination, input.signer)) {
    throw new Error('Community membership required');
  }
  const stat = await platform.fileSystem.stat(input.file.uri);
  if (!stat.exists || stat.isDirectory || stat.size == null || stat.size <= 0 ||
      stat.size > 20 * 1024 * 1024) throw new Error('Community file exceeds 20 MiB');
  // Static images must be successfully re-encoded before public upload. A
  // metadata-processing error must not silently publish the original photo.
  const prepared = await prepareAttachmentImage(input.file.uri, input.file.mime, input.quality);
  const mime = prepared ? (input.file.mime === 'image/png' ? 'image/png' : 'image/jpeg') : input.file.mime;
  try {
    const result = await uploadPublicCommunityFile({ signer: input.signer,
      fileUri: prepared?.uri ?? input.file.uri, mime,
      servers: await loadAccountMediaServers(input.accountPubkey) });
    const url = new URL(result.url);
    // The relay accepts only h on kind 9, so use ordinary interoperable URLs,
    // not private kind-15 encryption metadata or unsupported imeta tags.
    const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png',
      'audio/mp4': 'm4a', 'audio/webm': 'webm', 'video/mp4': 'mp4' };
    if (extensions[mime]) url.searchParams.set('filename', `media.${extensions[mime]}`);
    return await sendCommunityMessage({ destination: input.destination, signer: input.signer,
      content: url.toString(), previousEventIds: [] });
  } finally {
    if (prepared && prepared.uri !== input.file.uri) {
      await platform.fileSystem.delete(prepared.uri, { idempotent: true }).catch(() => {});
    }
  }
}
