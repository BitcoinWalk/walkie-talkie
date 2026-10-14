import MessagesSquare from 'lucide-react-native/icons/messages-square';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { AppCard } from '@/components/common/AppCard';
import { AppInput } from '@/components/common/AppInput';
import { AppScreen } from '@/components/common/AppScreen';
import { AppText } from '@/components/common/AppText';
import { ScreenHeader, useScreenHeaderClearance } from '@/components/common/ScreenHeader';
import { KEYBOARD_AVOIDING_BEHAVIOR } from '@/lib/platform';
import { buildSigner } from '@/services/account/account.service';
import {
  ensureCommunityMemberships,
  hasCommunityMembership,
} from '@/services/bitcoinwalk/community-membership';
import {
  loadCommunity,
  mergeCommunityMessageModels,
  mergeCommunityMessages,
  sendCommunityMessage,
  subscribeCommunity,
  type BitcoinWalkCommunityMessage,
} from '@/services/bitcoinwalk/community';
import { useActiveAccount } from '@/stores/active-account.store';
import { useSelectedCity } from '@/stores/selected-city.store';
import { spacing, uiDensity, useThemeColors } from '@/theme';

export default function CommunityScreen() {
  const { t, i18n } = useTranslation();
  const c = useThemeColors();
  const clearance = useScreenHeaderClearance();
  const city = useSelectedCity((state) => state.selectedCity);
  const accountPubkey = useActiveAccount((state) => state.activePubkey);
  const params = useLocalSearchParams<{ scope?: string }>();
  const scope = params.scope === 'global' ? 'global' : 'city';
  const destination = city?.chat.communities[scope] ?? null;
  const destinationKey = destination ? `${destination.relay}\n${destination.groupId}` : null;
  const [messages, setMessages] = useState<BitcoinWalkCommunityMessage[]>([]);
  const [name, setName] = useState<string | null>(null);
  const [about, setAbout] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedDestinationKey, setLoadedDestinationKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [joinedDestinationKey, setJoinedDestinationKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (quiet = false) => {
    if (!destination) {
      setLoading(false);
      return;
    }
    if (!quiet) setRefreshing(true);
    try {
      const result = await loadCommunity(destination);
      setName(result.metadata.name);
      setAbout(result.metadata.about);
      setMessages((current) => mergeCommunityMessageModels(current, result.messages));
      setLoadedDestinationKey(`${destination.relay}\n${destination.groupId}`);
      setError(null);
    } catch {
      setError(t('community.load_error'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [destination, t]);

  useEffect(() => {
    if (!destination) return;
    const controller = new AbortController();
    void loadCommunity(destination, controller.signal).then((result) => {
      setName(result.metadata.name);
      setAbout(result.metadata.about);
      setMessages((current) => mergeCommunityMessageModels(current, result.messages));
      setLoadedDestinationKey(`${destination.relay}\n${destination.groupId}`);
      setError(null);
    }).catch((cause: unknown) => {
      if ((cause as { name?: string })?.name !== 'AbortError') setError(t('community.load_error'));
    }).finally(() => setLoading(false));
    if (accountPubkey) {
      void hasCommunityMembership(accountPubkey, destination).then((joined) => {
        if (joined && !controller.signal.aborted) setJoinedDestinationKey(destinationKey);
      });
    }
    const unsubscribe = subscribeCommunity(destination, (event) => {
      setMessages((current) => mergeCommunityMessages(current, [event], destination.groupId));
    });
    return () => {
      controller.abort();
      unsubscribe();
    };
  }, [accountPubkey, destination, destinationKey, t]);

  async function join() {
    if (!destination || !accountPubkey || busy) return;
    setBusy(true);
    try {
      const result = await ensureCommunityMemberships(accountPubkey, [destination]);
      if (result.failed.length > 0) throw new Error('Community join failed');
      setJoinedDestinationKey(destinationKey);
      setError(null);
    } catch {
      setError(t('community.join_error'));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!destination || !accountPubkey || !draft.trim() || busy) return;
    setBusy(true);
    try {
      const signer = await buildSigner(accountPubkey);
      try {
        const event = await sendCommunityMessage({
          destination,
          signer,
          content: draft,
          previousEventIds: messages.filter((message) => message.pubkey !== accountPubkey)
            .map((message) => message.id),
        });
        setMessages((current) => mergeCommunityMessages(current, [event], destination.groupId));
      } finally {
        await signer.destroy?.();
      }
      setDraft('');
      setError(null);
    } catch {
      setError(t('community.send_error'));
    } finally {
      setBusy(false);
    }
  }

  const title = name ?? (scope === 'global'
    ? t('community.global_title')
    : city ? t('community.city_title', { city: city.name }) : t('community.title'));
  const joined = destinationKey !== null && joinedDestinationKey === destinationKey;
  const resolved = destinationKey !== null && loadedDestinationKey === destinationKey;
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    dateStyle: 'short', timeStyle: 'short',
  }), [i18n.resolvedLanguage]);

  return (
    <AppScreen edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={KEYBOARD_AVOIDING_BEHAVIOR}>
        {!destination ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center',
          gap: spacing.md, padding: spacing.xl }}>
          <MessagesSquare color={c.textMuted} size={uiDensity.contactAvatarSize} />
          <AppText variant="subtitle" align="center">{t('community.unavailable')}</AppText>
          <AppText tone="muted" align="center">{t('community.unavailable_hint')}</AppText>
        </View> : loading || !resolved ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={c.accent} />
        </View> : <>
          <FlatList
            data={messages}
            keyExtractor={(message) => message.id}
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: spacing.lg,
              paddingTop: clearance + spacing.sm, paddingBottom: spacing.lg, gap: spacing.sm }}
            ListHeaderComponent={<View style={{ gap: spacing.xs, paddingBottom: spacing.sm }}>
              <AppText variant="title">{title}</AppText>
              <AppText tone="muted">{about ?? t('community.about')}</AppText>
            </View>}
            ListEmptyComponent={<View style={{ alignItems: 'center', gap: spacing.sm, padding: spacing.xl }}>
              <MessagesSquare color={c.textMuted} size={uiDensity.tabIconSize} />
              <AppText variant="subtitle">{t('community.empty')}</AppText>
              <AppText tone="muted" align="center">{t('community.empty_hint')}</AppText>
            </View>}
            renderItem={({ item }) => <AppCard style={{ gap: spacing.xs }}>
              <AppText variant="caption" tone="muted" numberOfLines={1}>
                {item.pubkey === accountPubkey ? t('community.you') : `${item.pubkey.slice(0, 12)}…`}
              </AppText>
              <AppText>{item.content}</AppText>
              <AppText variant="caption" tone="muted">
                {dateFormatter.format(new Date(item.createdAt * 1_000))}
              </AppText>
            </AppCard>}
          />
          <View style={{ padding: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: c.border, gap: spacing.sm }}>
            {error ? <AppText tone="danger">{error}</AppText> : null}
            {joined ? <>
              <AppInput value={draft} onChangeText={setDraft} placeholder={t('community.message_placeholder')}
                maxLength={4_000} multiline />
              <AppButton label={t('community.send')} loading={busy} disabled={!draft.trim()}
                onPress={() => void send()} />
            </> : <>
              <AppText tone="muted">{t('community.join_hint')}</AppText>
              <AppButton label={t('community.join')} loading={busy} onPress={() => void join()} />
            </>}
          </View>
        </>}
      </KeyboardAvoidingView>
      <ScreenHeader title={title} />
    </AppScreen>
  );
}
