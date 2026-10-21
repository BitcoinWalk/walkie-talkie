import MessagesSquare from 'lucide-react-native/icons/messages-square';
import { Reply } from '@solar-icons/react-native/category/arrows-action/Linear/Reply';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/common/AppButton';
import { CommunityComposer } from '@/components/bitcoinwalk/CommunityComposer';
import { CommunityMessageRow } from '@/components/bitcoinwalk/CommunityMessageRow';
import {
  MessageActionMenu,
  MESSAGE_ACTION_MENU_ICON_SIZE,
  type LiftedBubble,
} from '@/components/chat/MessageActionMenu';
import type { BubbleRect } from '@/components/chat/MessageBubble';
import { AppScreen } from '@/components/common/AppScreen';
import { AppText } from '@/components/common/AppText';
import { ScreenHeader, useScreenHeaderClearance } from '@/components/common/ScreenHeader';
import { buildSigner } from '@/services/account/account.service';
import {
  ensureCommunityMemberships,
  hasCommunityMembership,
} from '@/services/bitcoinwalk/community-membership';
import {
  loadCommunity,
  aggregateCommunityReactions,
  hasActiveCommunityMembership,
  mergeCommunityMessages,
  sendCommunityReaction,
  subscribeCommunity,
  type BitcoinWalkCommunityMessage,
} from '@/services/bitcoinwalk/community';
import { useActiveAccount } from '@/stores/active-account.store';
import { loadCities, type BitcoinWalkCity } from '@/services/bitcoinwalk/cities';
import { useSelectedCity } from '@/stores/selected-city.store';
import {
  loadBitcoinWalkChatDirectory,
  type BitcoinWalkChatDirectory,
} from '@/services/bitcoinwalk/chat-directory';
import { getBottomChromeInset } from '@/lib/layout/bottom-chrome';
import { quickReactionKey, type QuickReaction } from '@/lib/nostr/quick-reaction';
import type { ReactionAggregate } from '@/lib/nostr/reactions';
import { useReactionPrefsStore } from '@/stores/reaction-prefs.store';
import { bottomBarHeight, spacing, uiDensity, useThemeColors } from '@/theme';

const HOSTS_ACCESS_DENIED = 'HOSTS_ACCESS_DENIED';

export function communityTimelineAtTail(event: NativeScrollEvent): boolean {
  const remaining = event.contentSize.height - event.layoutMeasurement.height - event.contentOffset.y;
  return remaining <= spacing['3xl'];
}

type Props = {
  embedded?: boolean;
  embeddedScope?: 'city' | 'global' | 'hosts';
};

export function BitcoinWalkCommunityView({ embedded = false, embeddedScope }: Props) {
  const { t } = useTranslation();
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const screenClearance = useScreenHeaderClearance();
  const clearance = embedded ? 0 : screenClearance;
  const composerClearance = bottomBarHeight + getBottomChromeInset(insets.bottom);
  const selectedCity = useSelectedCity((state) => state.selectedCity);
  const accountPubkey = useActiveAccount((state) => state.activePubkey);
  const params = useLocalSearchParams<{ scope?: string; city?: string | string[] }>();
  const routeScope = params.scope === 'global' || params.scope === 'hosts' ? params.scope : 'city';
  const scope = embeddedScope ?? routeScope;
  const requestedCity = (Array.isArray(params.city) ? params.city[0] : params.city)?.toLowerCase();
  const [resolvedCity, setResolvedCity] = useState<BitcoinWalkCity | null>(null);
  const city = !requestedCity || selectedCity?.slug === requestedCity ? selectedCity
    : resolvedCity?.slug === requestedCity ? resolvedCity : null;
  const resolvingCity = !!requestedCity && !city;
  const [chatDirectory, setChatDirectory] = useState<BitcoinWalkChatDirectory | null>(null);
  const destination = scope !== 'city'
    ? chatDirectory?.communities[scope] ?? (scope === 'global' ? city?.chat.communities.global : null) ?? null
    : city?.chat.communities[scope] ?? null;
  const destinationKey = destination ? `${destination.relay}\n${destination.groupId}` : null;
  const [messages, setMessages] = useState<BitcoinWalkCommunityMessage[]>([]);
  const [loadedDestinationKey, setLoadedDestinationKey] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [memberPubkeys, setMemberPubkeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joinedDestinationKey, setJoinedDestinationKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<BitcoinWalkCommunityMessage | null>(null);
  const [replyFocusRequestVersion, setReplyFocusRequestVersion] = useState(0);
  const [menuTarget, setMenuTarget] = useState<BitcoinWalkCommunityMessage | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ rect: BubbleRect; bubble: LiftedBubble } | null>(null);
  const [pendingReplyTarget, setPendingReplyTarget] = useState<BitcoinWalkCommunityMessage | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const quickEmojis = useReactionPrefsStore((state) => state.quickEmojis);
  const listRef = useRef<FlatList<BitcoinWalkCommunityMessage>>(null);
  const followingTail = useRef(true);
  const forceNextTail = useRef(false);
  const tailFrame = useRef<number | null>(null);
  const resolvingDestination = scope !== 'city' && destination === null && loading;
  const joined = destinationKey !== null && joinedDestinationKey === destinationKey;
  const visibleMessages = useMemo(
    () => loadedDestinationKey === destinationKey ? messages : [],
    [destinationKey, loadedDestinationKey, messages],
  );
  const visibleName = loadedDestinationKey === destinationKey ? name : null;
  const messageById = new Map(visibleMessages.map((message) => [message.id, message]));
  const mentionPubkeys = useMemo(
    () => [...new Set([...memberPubkeys, ...visibleMessages.map((message) => message.pubkey)])],
    [memberPubkeys, visibleMessages],
  );

  function startReply(message: BitcoinWalkCommunityMessage) {
    setReplyingTo(message);
    setReplyFocusRequestVersion((version) => version + 1);
  }

  function closeMenu() {
    setMenuTarget(null);
    setMenuAnchor(null);
  }

  function jumpToMessage(message: BitcoinWalkCommunityMessage) {
    const index = visibleMessages.findIndex((candidate) => candidate.id === message.id);
    if (index < 0) return;
    listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    setHighlightedId(message.id);
    setTimeout(() => setHighlightedId((current) => current === message.id ? null : current), 1_800);
  }

  async function applyReaction(message: BitcoinWalkCommunityMessage, reaction: QuickReaction) {
    if (!accountPubkey || !destination) return;
    const selectedKey = quickReactionKey(reaction);
    if (aggregateCommunityReactions(message, accountPubkey).some((entry) =>
      entry.selfReacted && quickReactionKey(entry.customEmoji ?? entry.emoji) === selectedKey)) return;
    let signer: Awaited<ReturnType<typeof buildSigner>> | null = null;
    try {
      signer = await buildSigner(accountPubkey);
      const event = await sendCommunityReaction({ destination, signer,
        targetId: message.id, reaction });
      setMessages((current) => mergeCommunityMessages(current, [event], destination.groupId));
      setError(null);
    } catch (cause) {
      console.warn('[bitcoinwalk.community] Reaction failed.', cause);
      setError(t('community.send_error'));
    } finally {
      await signer?.destroy?.();
    }
  }

  function handleLongPress(message: BitcoinWalkCommunityMessage, rect: BubbleRect,
    bubble: LiftedBubble) {
    setMenuTarget(message);
    setMenuAnchor({ rect, bubble });
  }

  function handleTapReaction(message: BitcoinWalkCommunityMessage, reaction: ReactionAggregate) {
    void applyReaction(message, reaction.customEmoji ?? reaction.emoji);
  }

  const scrollToTail = useCallback((animated: boolean) => {
    if (tailFrame.current !== null) cancelAnimationFrame(tailFrame.current);
    tailFrame.current = requestAnimationFrame(() => {
      tailFrame.current = null;
      listRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useEffect(() => () => {
    if (tailFrame.current !== null) cancelAnimationFrame(tailFrame.current);
  }, []);

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => {
      if (followingTail.current) scrollToTail(false);
    });
    return () => shown.remove();
  }, [scrollToTail]);

  useEffect(() => {
    followingTail.current = true;
    forceNextTail.current = true;
  }, [destinationKey]);

  useEffect(() => {
    if (scope === 'city') return;
    const controller = new AbortController();
    void loadBitcoinWalkChatDirectory(controller.signal).then((directory) => {
      if (!controller.signal.aborted) setChatDirectory(directory);
    }).catch((cause: unknown) => {
      if ((cause as { name?: string })?.name !== 'AbortError') {
        setLoading(false);
        setError(t('community.load_error'));
      }
    });
    return () => controller.abort();
  }, [scope, t]);

  useEffect(() => {
    if (!requestedCity || selectedCity?.slug === requestedCity) return;
    const controller = new AbortController();
    void loadCities(controller.signal).then((cities) => {
      if (controller.signal.aborted) return;
      const match = cities.find((candidate) => candidate.slug === requestedCity);
      if (!match) throw new Error('Unknown BitcoinWalk city');
      setResolvedCity(match);
      setError(null);
    }).catch((cause: unknown) => {
      if ((cause as { name?: string })?.name !== 'AbortError') setError(t('community.load_error'));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [requestedCity, selectedCity?.slug, t]);

  const refresh = useCallback(async (quiet = false) => {
    if (!destination) {
      setLoading(false);
      return;
    }
    if (!quiet) setRefreshing(true);
    let signer: Awaited<ReturnType<typeof buildSigner>> | null = null;
    try {
      if (scope === 'hosts' || joined) {
        if (!accountPubkey) throw new Error('No active account');
        signer = await buildSigner(accountPubkey);
      }
      const result = await loadCommunity(destination, undefined, signer ?? undefined);
      if (scope === 'hosts' && (!accountPubkey || !result.roster.memberPubkeys.includes(accountPubkey))) {
        throw new Error(HOSTS_ACCESS_DENIED);
      }
      setName(result.metadata.name);
      setMemberPubkeys(result.roster.memberPubkeys);
      setMessages(result.messages);
      setLoadedDestinationKey(destinationKey);
      setError(null);
    } catch (cause: unknown) {
      setError(cause instanceof Error && cause.message === HOSTS_ACCESS_DENIED
        ? t('community.hosts_access_required')
        : t('community.load_error'));
    } finally {
      await signer?.destroy?.();
      setLoading(false);
      setRefreshing(false);
    }
  }, [accountPubkey, destination, destinationKey, joined, scope, t]);

  useEffect(() => {
    if (!destination) return;
    const controller = new AbortController();
    let unsubscribe = () => {};
    let signer: Awaited<ReturnType<typeof buildSigner>> | null = null;
    void (async () => {
      try {
        if (scope === 'hosts' && !accountPubkey) throw new Error(HOSTS_ACCESS_DENIED);
        const savedMembership = scope !== 'hosts' && accountPubkey
          ? await hasCommunityMembership(accountPubkey, destination)
          : false;
        let hasAccess = scope === 'hosts' || joined || savedMembership;
        if (accountPubkey) {
          signer = await buildSigner(accountPubkey);
          if (!hasAccess) hasAccess = await hasActiveCommunityMembership(destination, signer, controller.signal);
        }
        if (controller.signal.aborted) return;
        const result = await loadCommunity(destination, controller.signal, hasAccess ? signer ?? undefined : undefined);
        if (controller.signal.aborted) return;
        if (scope === 'hosts' && (!accountPubkey || !result.roster.memberPubkeys.includes(accountPubkey))) {
          throw new Error(HOSTS_ACCESS_DENIED);
        }
        setName(result.metadata.name);
        setMemberPubkeys(result.roster.memberPubkeys);
        setMessages(result.messages);
        setLoadedDestinationKey(destinationKey);
        if (hasAccess) setJoinedDestinationKey(destinationKey);
        setError(null);
        unsubscribe = subscribeCommunity(destination, (event) => {
          setMessages((current) => mergeCommunityMessages(current, [event], destination.groupId));
        }, hasAccess ? signer ?? undefined : undefined);
      } catch (cause: unknown) {
        if ((cause as { name?: string })?.name !== 'AbortError') {
          setError(cause instanceof Error && cause.message === HOSTS_ACCESS_DENIED
            ? t('community.hosts_access_required')
            : t('community.load_error'));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => {
      controller.abort();
      unsubscribe();
      void signer?.destroy?.();
    };
  }, [accountPubkey, destination, destinationKey, joined, scope, t]);

  async function join() {
    if (!destination || busy) return;
    if (!accountPubkey) {
      router.push('/welcome');
      return;
    }
    setBusy(true);
    try {
      const result = await ensureCommunityMemberships(accountPubkey, [destination]);
      if (result.failed.length > 0) {
        const key = result.failed[0];
        throw new Error(result.failureReasons[key] ?? 'Community join failed');
      }
      setJoinedDestinationKey(destinationKey);
      setError(null);
    } catch (cause) {
      console.warn('[bitcoinwalk.community] Join action failed.', cause);
      setError(t('community.join_error'));
    } finally {
      setBusy(false);
    }
  }

  const title = visibleName ?? (scope === 'global'
    ? t('community.global_title')
    : scope === 'hosts'
      ? t('community.hosts_full_title')
      : city ? t('community.city_title', { city: city.name }) : t('community.title'));

  const content = (
      <View style={{ flex: 1, paddingTop: clearance }}>
        {resolvingCity || resolvingDestination || !!destination && loading ? <View
          accessibilityLiveRegion="polite"
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}
        >
          <ActivityIndicator color={c.accent} accessibilityLabel={t('boot.loading_messages')} />
          <AppText tone="muted">{t('boot.loading_messages')}</AppText>
        </View> : !destination ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center',
          gap: spacing.md, padding: spacing.xl }}>
          <MessagesSquare color={c.textMuted} size={uiDensity.contactAvatarSize} />
          <AppText variant="subtitle" align="center">{t('community.unavailable')}</AppText>
          <AppText tone="muted" align="center">{t('community.unavailable_hint')}</AppText>
        </View> : <>
          <FlatList
            ref={listRef}
            data={visibleMessages}
            keyExtractor={(message) => message.id}
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
              followingTail.current = communityTimelineAtTail(event.nativeEvent);
            }}
            scrollEventThrottle={100}
            onLayout={() => {
              if (followingTail.current) scrollToTail(false);
            }}
            onContentSizeChange={() => {
              if (!followingTail.current && !forceNextTail.current) return;
              forceNextTail.current = false;
              scrollToTail(true);
            }}
            onScrollToIndexFailed={({ index, averageItemLength }) => {
              listRef.current?.scrollToOffset({
                offset: Math.max(0, index * averageItemLength),
                animated: true,
              });
            }}
            contentContainerStyle={{ paddingTop: spacing.sm }}
            // Android's FlatList scrollToEnd target can omit container padding.
            // A real footer participates in content measurement, so the newest
            // bubble always clears the composer while the keyboard is visible.
            ListFooterComponent={<View style={{ height: composerClearance + spacing.lg }} />}
            ListEmptyComponent={<View style={{ alignItems: 'center', gap: spacing.sm, padding: spacing.xl }}>
              <MessagesSquare color={c.textMuted} size={uiDensity.tabIconSize} />
              <AppText variant="subtitle">{t('community.empty')}</AppText>
              <AppText tone="muted" align="center">
                {joined ? t('community.empty_joined_hint') : t('community.empty_hint')}
              </AppText>
            </View>}
            renderItem={({ item, index }) => <CommunityMessageRow
              message={item}
              replyTarget={item.replyToId ? messageById.get(item.replyToId) ?? null : null}
              reactions={accountPubkey ? aggregateCommunityReactions(item, accountPubkey) : []}
              accountPubkey={accountPubkey ?? ''}
              highlighted={highlightedId === item.id}
              groupStart={index === 0 || visibleMessages[index - 1]?.pubkey !== item.pubkey}
              onReply={startReply}
              onLongPress={handleLongPress}
              onPressReply={jumpToMessage}
              onTapReaction={handleTapReaction}
            />}
          />
          {joined && accountPubkey ? <CommunityComposer
            key={`${accountPubkey}:${destinationKey}`}
            accountPubkey={accountPubkey} destination={destination}
            mentionPubkeys={mentionPubkeys}
            replyTo={replyingTo ? {
              id: replyingTo.id,
              senderName: replyingTo.pubkey === accountPubkey
                ? t('community.you')
                : `${replyingTo.pubkey.slice(0, 8)}…`,
              contentPreview: replyingTo.content,
            } : null}
            onCancelReply={() => setReplyingTo(null)}
            onReplySent={() => setReplyingTo(null)}
            focusRequestVersion={replyFocusRequestVersion}
            onSent={(event) => {
              followingTail.current = true;
              forceNextTail.current = true;
              setMessages((current) => mergeCommunityMessages(current, [event], destination.groupId));
            }}
          /> : <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: c.border, gap: spacing.sm }}>
            {error && (joined || scope !== 'hosts') ? <AppText tone="danger">{error}</AppText> : null}
            {scope === 'hosts' ? (
              <AppText tone={error ? 'danger' : 'muted'}>
                {error ?? t('community.hosts_access_required')}
              </AppText>
            ) : <>
              <AppText tone="muted">{accountPubkey
                ? t('community.join_hint')
                : t('community.sign_in_hint')}</AppText>
              <AppButton
                label={accountPubkey ? t('community.join') : t('community.sign_in')}
                loading={busy}
                onPress={() => void join()}
              />
            </>}
          </View>}
          <MessageActionMenu
            visible={!!menuAnchor}
            rect={menuAnchor?.rect ?? null}
            bubble={menuAnchor?.bubble ?? null}
            quickEmojis={quickEmojis}
            reactedReactionKeys={menuTarget && accountPubkey
              ? aggregateCommunityReactions(menuTarget, accountPubkey)
                  .filter((reaction) => reaction.selfReacted)
                  .map((reaction) => quickReactionKey(reaction.customEmoji ?? reaction.emoji))
              : []}
            onReact={(reaction) => {
              const target = menuTarget;
              closeMenu();
              if (target) void applyReaction(target, reaction);
            }}
            onMore={closeMenu}
            showMoreReaction={false}
            actions={menuTarget ? [{
              key: 'reply',
              label: t('chat.actions.reply'),
              icon: <Reply size={MESSAGE_ACTION_MENU_ICON_SIZE} color={c.text} />,
              onPress: () => {
                setPendingReplyTarget(menuTarget);
                closeMenu();
              },
            }] : []}
            onClose={closeMenu}
            onClosed={() => {
              if (!pendingReplyTarget) return;
              startReply(pendingReplyTarget);
              setPendingReplyTarget(null);
            }}
          />
        </>}
      </View>
  );

  if (embedded) return content;

  return (
    <AppScreen edges={[]}>
      {content}
      <ScreenHeader title={title} />
    </AppScreen>
  );
}

export default function CommunityScreen() {
  const account = useActiveAccount((state) => state.activePubkey);
  const params = useLocalSearchParams<{scope?: string; city?: string}>();
  return <BitcoinWalkCommunityView key={`${account}:${params.scope}:${params.city}`} />;
}
