import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AttachmentSendConfirmation, type PickedAttachment } from '@/components/chat/AttachmentSendConfirmation';
import type { AttachmentSource } from '@/components/chat/AttachmentPanel';
import { ChatInput } from '@/components/chat/ChatInput';
import { ChatComposerPanelBackHandler, ChatComposerPanelProvider } from '@/components/chat/chat-composer-panel-context';
import type { VoicePayload } from '@/components/chat/VoiceRecorderBar';
import { AppText } from '@/components/common/AppText';
import { AppButton } from '@/components/common/AppButton';
import type { ImageSendQuality } from '@/lib/attachments/image-quality';
import { IS_IOS } from '@/lib/platform';
import { shareContactContent } from '@/lib/share/contact-card';
import { platform } from '@/platform';
import { buildSigner } from '@/services/account/account.service';
import { sendCommunityFile } from '@/services/bitcoinwalk/community-media';
import { beginCommunityPaymentRequest } from '@/services/bitcoinwalk/community-payment-request';
import { sendCommunityMessage, type BitcoinWalkCommunityDestination } from '@/services/bitcoinwalk/community';
import type { Event } from 'nostr-tools';

export const COMMUNITY_ATTACHMENT_SOURCES: readonly AttachmentSource[] =
  ['camera', 'library', 'file', 'invoice', 'card'];

type Props = {
  accountPubkey: string;
  destination: BitcoinWalkCommunityDestination;
  onSent: (event: Event) => void;
};

/** Shared DM chrome, with a separate NIP-29 transport and public-media consent. */
export function CommunityComposer({ accountPubkey, destination, onSent }: Props) {
  const { t } = useTranslation();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [files, setFiles] = useState<PickedAttachment[]>([]);
  const [preview, setPreview] = useState(false);
  const [pendingCaption, setPendingCaption] = useState<string | null>(null);
  const voiceUris = useRef(new Set<string>());
  const disposed = useRef(false);

  useEffect(() => {
    disposed.current = false;
    const owned = voiceUris.current;
    return () => {
      disposed.current = true;
      // A committed transfer owns its source until its attempt settles.
      if (!lock.current) {
        for (const uri of owned) void platform.fileSystem.delete(uri, { idempotent: true }).catch(() => {});
        owned.clear();
      }
    };
  }, []);

  function releaseVoice(uri: string) {
    if (!voiceUris.current.delete(uri)) return;
    void platform.fileSystem.delete(uri, { idempotent: true }).catch(() => {});
  }

  async function run(action: () => Promise<void>) {
    if (lock.current) throw new Error('Send already in progress');
    lock.current = true;
    setBusy(true);
    setError(false);
    // Let the disabled composer paint before signing, hashing or encoding.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    try { await action(); }
    catch (cause) { setError(true); throw cause; }
    finally {
      lock.current = false;
      setBusy(false);
      if (disposed.current) for (const uri of [...voiceUris.current]) releaseVoice(uri);
    }
  }

  async function sendText(content: string) {
    await run(async () => {
      const signer = await buildSigner(accountPubkey);
      try {
        onSent(await sendCommunityMessage({ destination, signer, content, previousEventIds: [] }));
      } finally { await signer.destroy?.(); }
    });
  }

  async function consent(): Promise<boolean> {
    return platform.confirmationDialog.confirm({ title: t('community.title'),
      message: t('community.share_warning'), cancelLabel: t('common.cancel'),
      confirmLabel: t('common.continue') });
  }

  async function pick(source: AttachmentSource) {
    if (lock.current || !await consent() || disposed.current || lock.current) return;
    if (source === 'invoice') {
      const id = await beginCommunityPaymentRequest(accountPubkey, destination);
      router.push(`/wallet-receive?communityRequest=${encodeURIComponent(id)}`);
      return;
    }
    if (source === 'card') { await sendText(shareContactContent(accountPubkey)); return; }
    let selected: PickedAttachment[];
    if (source === 'file') {
      const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (result.canceled) return;
      selected = result.assets.map((asset) => ({ uri: asset.uri,
        mime: asset.mimeType ?? 'application/octet-stream', name: asset.name, size: asset.size }));
    } else {
      if (source === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
        await platform.confirmationDialog.notify({ title: t('attach.camera_permission'), okLabel: t('common.ok') });
        return;
      }
      if (source === 'library' && IS_IOS && !(await ImagePicker.requestMediaLibraryPermissionsAsync()).granted) {
        await platform.confirmationDialog.notify({ title: t('attach.library_permission'), okLabel: t('common.ok') });
        return;
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 1, exif: false })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'],
          allowsMultipleSelection: true, selectionLimit: 10, quality: 1, exif: false });
      if (result.canceled) return;
      selected = result.assets.map((asset) => ({ uri: asset.uri,
        mime: asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
        name: asset.fileName ?? undefined, size: asset.fileSize,
        width: asset.width, height: asset.height }));
    }
    if (selected.length > 10) throw new Error('Too many files');
    setFiles(selected);
    setPreview(true);
  }

  async function sendFiles(quality: ImageSendQuality, message: string) {
    setPreview(false);
    await run(async () => {
      const signer = await buildSigner(accountPubkey);
      try {
        // Sequential bounded uploads avoid holding a batch of media in memory.
        // Remove only published entries, so retry never resends completed files.
        for (const file of files) {
          onSent(await sendCommunityFile({ accountPubkey, destination, signer, file, quality }));
          releaseVoice(file.uri);
          setFiles((current) => current.filter((candidate) => candidate.uri !== file.uri));
        }
        if (message.trim()) {
          setPendingCaption(message);
          onSent(await sendCommunityMessage({ destination, signer,
            content: message, previousEventIds: [] }));
          setPendingCaption(null);
        }
      } finally { await signer.destroy?.(); }
    });
  }

  async function sendVoice(payload: VoicePayload) {
    voiceUris.current.add(payload.uri);
    let retained = false;
    try {
      if (!await consent() || disposed.current) return;
      await run(async () => {
        const signer = await buildSigner(accountPubkey);
        try { onSent(await sendCommunityFile({ accountPubkey, destination, signer,
          file: { uri: payload.uri, mime: payload.mime }, quality: 'original' })); }
        finally { await signer.destroy?.(); }
      });
    } catch (cause) {
      retained = !disposed.current;
      if (retained) {
        setFiles([{ uri: payload.uri, mime: payload.mime }]);
        setPreview(true);
      }
      throw cause;
    } finally {
      if (!retained) releaseVoice(payload.uri);
    }
  }

  return <ChatComposerPanelProvider>
    <ChatComposerPanelBackHandler />
    <ChatInput disabled={busy} onSend={sendText} maxLength={4_000}
      aboveInput={busy ? <AppText tone="muted">{t('attach.sending')}</AppText>
        : pendingCaption ? <AppButton label={t('common.retry')} variant="text"
          onPress={() => { void sendText(pendingCaption).then(() => setPendingCaption(null)).catch(() => {}); }} />
          : error ? <AppText tone="danger">{t('community.send_error')}</AppText> : undefined}
      draftKey={`nip29:${destination.relay}:${destination.groupId}`}
      attachmentSources={COMMUNITY_ATTACHMENT_SOURCES}
      onPickAttachment={(source) => { void pick(source).catch(() => setError(true)); }}
      onSendVoice={(payload) => { void sendVoice(payload).catch(() => setError(true)); }} />
    <AttachmentSendConfirmation visible={preview} files={files.map((file) => ({ ...file,
      source: { kind: 'uri' as const, uri: file.uri } }))}
      onClose={() => { files.forEach((file) => releaseVoice(file.uri)); setPreview(false); setFiles([]); }}
      onConfirm={(quality, message) => {
        void sendFiles(quality, message).catch(() => setPreview(true));
      }}
      onRemoveFile={(index) => {
        if (files[index]) releaseVoice(files[index].uri);
        setFiles((current) => current.filter((_, i) => i !== index));
      }}
      onImageDimensions={(index, width, height) => setFiles((current) => current.map((file, i) =>
        i === index ? { ...file, width, height } : file))} />
  </ChatComposerPanelProvider>;
}
