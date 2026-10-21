import { router, useFocusEffect } from 'expo-router';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import Plus from 'lucide-react-native/icons/plus';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BitcoinWalkCommunityRow } from '@/components/bitcoinwalk/BitcoinWalkCommunityRow';
import { NearbyRoomRow } from '@/components/bitcoinwalk/NearbyRoomRow';
import { BitcoinWalkCityPickerSheet } from '@/components/bitcoinwalk/BitcoinWalkCityPickerSheet';
import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { AppText } from '@/components/common/AppText';
import { IconButton } from '@/components/common/IconButton';
import { NotificationDot } from '@/components/common/NotificationDot';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { ConversationListItem } from '@/components/conversation/ConversationListItem';
import { usePrimaryPaneNavigation } from '@/components/navigation/primary-pane-navigation';
import { useMainInboxConversations, useRequestConversations, useUnreadRequestCount, type ConversationWithLast } from '@/hooks/use-conversations';
import { useScrolled } from '@/hooks/use-scrolled';
import { attachmentLabel } from '@/lib/nostr/attachment-label';
import { loadBitcoinWalkInbox, type BitcoinWalkInbox } from '@/services/bitcoinwalk/chat-inbox';
import { BITCOINWALK_ORIGIN } from '@/services/bitcoinwalk/config';
import { subscribeCommunityMembershipChanges } from '@/services/bitcoinwalk/membership-events';
import { useActiveAccount } from '@/stores/active-account.store';
import { useChatCity } from '@/stores/chat-city.store';
import { useSelectedCity } from '@/stores/selected-city.store';
import { useUnreadIndicatorsEnabled } from '@/stores/unread-count.store';
import { setConversationMuted, setConversationPinned } from '@/services/conversation/conversation-prefs.service';
import { dmService } from '@/services/dm/dm.service';
import { showToast } from '@/stores/toast.store';
import { bottomBarHeight, headerHeight, spacing, uiDensity, useThemeColors } from '@/theme';
import { iconStrokeWidth } from '@/theme/icons';

const GLOBAL_AVATAR = require('../../../../assets/images/bitcoinwalk-icon.png') as number;

type InboxRow = { kind: 'community'; key: string; title: string; subtitle: string;
  picture: string | number; unreadCount?: number; href: string }
  | { kind: 'private'; key: string; item: ConversationWithLast }
  | { kind: 'nearby'; key: 'nearby' };

/** One virtualized inbox. Community histories load only after a row is opened. */
export default function BitcoinWalkChatsTab() {
  const { t } = useTranslation();
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const accountPubkey = useActiveAccount((state) => state.activePubkey) ?? '';
  const walkCity = useSelectedCity((state) => state.selectedCity);
  const preferredChatCity = useChatCity((state) => state.preferredSlug);
  const chatCityLoaded = useChatCity((state) => state.loaded);
  const loadChatCity = useChatCity((state) => state.load);
  const selectChatCity = useChatCity((state) => state.select);
  const { conversations } = useMainInboxConversations(accountPubkey);
  const { conversations: requests } = useRequestConversations(accountPubkey);
  const unreadRequests = useUnreadRequestCount(accountPubkey);
  const unreadIndicators = useUnreadIndicatorsEnabled();
  const { open, selection, wide } = usePrimaryPaneNavigation();
  const { scrolled, scrollProps } = useScrolled();
  const [snapshot, setSnapshot] = useState<{ account: string; inbox: BitcoinWalkInbox } | null>(null);
  const [failedAccount, setFailedAccount] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [revision, setRevision] = useState(0);
  const [cityPickerVisible, setCityPickerVisible] = useState(false);
  const inbox = snapshot?.account === accountPubkey ? snapshot.inbox : null;

  useEffect(() => {
    if (!chatCityLoaded) void loadChatCity();
  }, [chatCityLoaded, loadChatCity]);

  useEffect(() => subscribeCommunityMembershipChanges((account) => {
    if (account === accountPubkey) setRevision((value) => value + 1);
  }), [accountPubkey]);

  useFocusEffect(useCallback(() => {
    // A pull-to-refresh explicitly starts a fresh bounded membership read.
    void revision;
    const controller = new AbortController();
    if (!accountPubkey) return () => controller.abort();
    setRefreshing(true);
    void loadBitcoinWalkInbox(accountPubkey, controller.signal).then((result) => {
      if (!controller.signal.aborted) {
        setSnapshot((previous) => ({ account: accountPubkey, inbox: {
          ...result, cities: result.membershipError && previous?.account === accountPubkey
            ? previous.inbox.cities : result.cities,
        } }));
        setFailedAccount(result.membershipError ? accountPubkey : null);
      }
    }).catch(() => {
      if (!controller.signal.aborted) setFailedAccount(accountPubkey);
    }).finally(() => {
      if (!controller.signal.aborted) setRefreshing(false);
    });
    return () => controller.abort();
  }, [accountPubkey, revision]));

  const guidePubkey = inbox?.directory.guidePubkey;
  const guide = [...conversations, ...requests].find((item) =>
    item.conversation.accountPubkey === accountPubkey && item.conversation.conversationKey === guidePubkey);
  const privateChats = useMemo(() => {
    const visible = conversations.filter((item) => item.conversation.accountPubkey === accountPubkey &&
      item.conversation.conversationKey !== guidePubkey);
    // Keep existing pins/recency within sections. Other private groups remain
    // accessible before one-to-one DMs, rather than being silently discarded.
    return [...visible.filter((item) => item.conversation.groupId !== null),
      ...visible.filter((item) => item.conversation.groupId === null)];
  }, [accountPubkey, conversations, guidePubkey]);

  const activeCity = useMemo(() => {
    if (!inbox || inbox.cities.length === 0) return null;
    const preferred = chatCityLoaded
      ? inbox.cities.find((city) => city.slug === preferredChatCity)
      : null;
    const selectedWalkCity = inbox.cities.find((city) =>
      city.id === walkCity?.id || city.slug === walkCity?.slug);
    return preferred ?? selectedWalkCity ?? inbox.cities[0];
  }, [chatCityLoaded, inbox, preferredChatCity, walkCity?.id, walkCity?.slug]);

  useEffect(() => {
    if (!chatCityLoaded || !preferredChatCity || !inbox || inbox.membershipError) return;
    if (!inbox.cities.some((city) => city.slug === preferredChatCity)) selectChatCity(null);
  }, [chatCityLoaded, inbox, preferredChatCity, selectChatCity]);

  const rows = useMemo<InboxRow[]>(() => {
    const communities: InboxRow[] = inbox ? [
      {kind: 'community', key: 'guide', title: t('community.guide_full_title'),
        subtitle: guide?.lastMessageContent ?? t('community.guide_subtitle'),
        unreadCount: unreadIndicators ? guide?.conversation.unreadCount : 0,
        picture: `${BITCOINWALK_ORIGIN}/brand/bitcoinwalk-admin-favicon.png`,
        href: `/chat/${guidePubkey}?mode=guide&name=${encodeURIComponent(t('community.guide_full_title'))}`},
      {kind: 'community', key: 'global', title: t('community.global_title'),
        subtitle: t('community.global_subtitle'), picture: GLOBAL_AVATAR, href: '/community?scope=global'},
      ...(activeCity ? [{kind: 'community' as const, key: 'city',
        title: t('community.city_title', { city: activeCity.name }), subtitle: t('community.city_short'),
        picture: activeCity.avatarUrl,
        href: `/community?scope=city&city=${encodeURIComponent(activeCity.slug)}`}]
        : []),
      ...(inbox.hosts ? [{kind: 'community' as const, key: 'hosts', title: t('community.hosts_full_title'),
        subtitle: t('community.hosts_subtitle'), picture: GLOBAL_AVATAR, href: '/community?scope=hosts'}] : []),
    ] : [];
    return [{ kind: 'nearby', key: 'nearby' }, ...communities, ...privateChats.map((item): InboxRow => ({
      kind: 'private', key: `private:${item.conversation.conversationKey}`, item,
    }))];
  }, [activeCity, guide, guidePubkey, inbox, privateChats, t, unreadIndicators]);

  const openConversation = useCallback((key: string, kind: 'relay' | 'proximity', name: string | null) => {
    open(`/chat/${encodeURIComponent(key)}?transport=${kind}${name ? `&name=${encodeURIComponent(name)}` : ''}`);
  }, [open]);
  const refresh = () => setRevision((value) => value + 1);
  const reportFailure = () => showToast(t('community.inbox_action_error'));

  return (
    <AppScreen edges={[]}>
      <FlatList
        {...scrollProps}
        data={rows}
        keyExtractor={(item) => item.key}
        refreshing={refreshing}
        onRefresh={refresh}
        contentContainerStyle={{ paddingTop: headerHeight + insets.top,
          paddingBottom: bottomBarHeight + insets.bottom }}
        ListHeaderComponent={<>
          {refreshing && !inbox && accountPubkey ? (
            <View
              accessibilityLiveRegion="polite"
              style={{ alignItems: 'center', gap: spacing.sm, padding: spacing.xl }}
            >
              <ActivityIndicator color={c.accent} accessibilityLabel={t('boot.loading_messages')} />
              <AppText tone="muted">{t('boot.loading_messages')}</AppText>
            </View>
          ) : null}
          {failedAccount === accountPubkey ? <View style={{ padding: spacing.lg, gap: spacing.sm }}>
            <AppText tone="muted">{t('community.inbox_load_error')}</AppText>
            <AppButton label={t('walks.retry')} variant="text" onPress={refresh} />
          </View> : null}
          {!accountPubkey ? <View style={{ padding: spacing.lg }}>
            <AppButton label={t('community.sign_in')} onPress={() => router.push('/welcome')} />
          </View> : null}
        </>}
        renderItem={({ item: row }) => {
          if (row.kind === 'nearby') return <NearbyRoomRow onPress={() => open('/nearby-room')} />;
          if (row.kind === 'community') return <BitcoinWalkCommunityRow
            title={row.title} subtitle={row.subtitle} picture={row.picture} unreadCount={row.unreadCount}
            trailing={row.key === 'city' && (inbox?.cities.length ?? 0) > 1 ? (
              <IconButton
                variant="plain"
                icon={<ChevronDown
                  color={c.textMuted}
                  size={uiDensity.headerActionIconSize}
                  strokeWidth={iconStrokeWidth.default}
                />}
                accessibilityLabel={t('community.city_picker_action')}
                onPress={() => setCityPickerVisible(true)}
              />
            ) : undefined}
            onPress={() => open(row.href)} />;
          const item = row.item;
          const conversation = item.conversation;
          return <ConversationListItem
            conversationKey={conversation.conversationKey}
            counterpartyPubkey={conversation.groupId ? null : conversation.conversationKey}
            groupMemberPubkeys={conversation.groupId ? conversation.memberPubkeys : undefined}
            conversationName={conversation.name}
            lastMessagePreview={item.lastMessageKind === 15 ? attachmentLabel(item.lastMessageTags, {
              file: t('conversations.attachment_file_preview'), image: t('conversations.attachment_image_preview'),
              video: t('conversations.attachment_video_preview'), voice: t('conversations.attachment_voice_preview'),
            }) : item.lastMessageContent}
            lastMessageTags={item.lastMessageTags}
            lastMessageSenderPubkey={item.lastMessageSenderPubkey}
            lastMessageFromSelf={item.lastMessageSenderPubkey === accountPubkey}
            updatedAt={conversation.updatedAt} unreadCount={unreadIndicators ? conversation.unreadCount : 0}
            muted={conversation.muted} identityKind={conversation.deliveryKind}
            active={wide && selection.conversationKey === conversation.conversationKey}
            showPressedFill={!wide} onPress={openConversation}
            pinned={conversation.pinned}
            onToggleMute={(key, muted) => { void setConversationMuted(accountPubkey, key, !muted).catch(reportFailure); }}
            onTogglePin={(key, pinned) => { void setConversationPinned(accountPubkey, key, !pinned).catch(reportFailure); }}
            onDelete={(key) => { void dmService.deleteConversation(accountPubkey, key).catch(reportFailure); }} />;
        }}
      />
      <ScreenHeader back={false} bordered={scrolled} title={t('tabs.conversations')}
        right={<View>
          <IconButton variant="plain" size={uiDensity.headerActionSize}
            icon={<Plus color={c.text} size={uiDensity.headerActionIconSize} />}
            accessibilityLabel={t('conversations.new_chat_action')}
            onPress={() => open(accountPubkey ? '/contacts' : '/welcome')} />
          {unreadRequests > 0 ? <NotificationDot style={{ position: 'absolute', top: spacing.xs, end: spacing.xs }} /> : null}
        </View>} />
      <BitcoinWalkCityPickerSheet
        visible={cityPickerVisible}
        cities={inbox?.cities ?? []}
        selectedSlug={activeCity?.slug ?? null}
        onClose={() => setCityPickerVisible(false)}
        onSelect={(city) => {
          selectChatCity(city.slug);
          setCityPickerVisible(false);
        }}
      />
    </AppScreen>
  );
}
