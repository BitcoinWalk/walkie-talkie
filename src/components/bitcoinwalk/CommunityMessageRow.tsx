import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { BubbleRect, MessageBubbleReplyPreview } from '@/components/chat/MessageBubble';
import { MessageBubble } from '@/components/chat/MessageBubble';
import type { LiftedBubble } from '@/components/chat/MessageActionMenu';
import { useDisplayName } from '@/hooks/use-display-name';
import type { ReactionAggregate } from '@/lib/nostr/reactions';
import type { BitcoinWalkCommunityMessage } from '@/services/bitcoinwalk/community';

type Props = {
  message: BitcoinWalkCommunityMessage;
  replyTarget: BitcoinWalkCommunityMessage | null;
  reactions: ReactionAggregate[];
  accountPubkey: string;
  highlighted: boolean;
  groupStart: boolean;
  onReply: (message: BitcoinWalkCommunityMessage) => void;
  onLongPress: (
    message: BitcoinWalkCommunityMessage,
    rect: BubbleRect,
    bubble: LiftedBubble,
  ) => void;
  onPressReply: (message: BitcoinWalkCommunityMessage) => void;
  onTapReaction: (message: BitcoinWalkCommunityMessage, reaction: ReactionAggregate) => void;
};

/** BitcoinWalk NIP-29 row using the same interaction and bubble primitives as DMs. */
export const CommunityMessageRow = memo(function CommunityMessageRow({
  message,
  replyTarget,
  reactions,
  accountPubkey,
  highlighted,
  groupStart,
  onReply,
  onLongPress,
  onPressReply,
  onTapReaction,
}: Props) {
  const { t } = useTranslation();
  const isSelf = message.pubkey === accountPubkey;
  const sender = useDisplayName(message.pubkey);
  const replySender = useDisplayName(replyTarget?.pubkey ?? message.pubkey);
  const senderName = isSelf ? t('community.you') : sender.name;
  const replyPreview: MessageBubbleReplyPreview | null = replyTarget
    ? {
        senderPubkey: replyTarget.pubkey,
        senderDisplayName: replyTarget.pubkey === accountPubkey
          ? t('community.you')
          : replySender.name,
        contentPreview: replyTarget.content,
      }
    : null;
  const lifted: LiftedBubble = {
    content: message.content,
    tags: message.tags,
    isSelf,
    createdAt: message.createdAt,
    replyTo: replyPreview,
    reactions,
    remoteContentMode: 'request',
  };

  return (
    <MessageBubble
      content={message.content}
      tags={message.tags}
      isSelf={isSelf}
      createdAt={message.createdAt}
      orderAt={message.createdAt}
      replyTo={replyPreview}
      reactions={reactions}
      remoteContentMode="request"
      groupStart={groupStart}
      groupSenderPubkey={isSelf ? undefined : message.pubkey}
      groupSenderName={isSelf ? t('community.you') : senderName}
      groupSenderPicture={sender.profile?.picture ?? null}
      showGroupSenderName={groupStart}
      showGroupSenderAvatar={groupStart}
      highlighted={highlighted}
      onSwipeReply={() => onReply(message)}
      onLongPress={(rect) => onLongPress(message, rect, lifted)}
      onPressReply={replyTarget ? () => onPressReply(replyTarget) : undefined}
      onTapReaction={(reaction) => onTapReaction(message, reaction)}
    />
  );
});
