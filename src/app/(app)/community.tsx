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
  loadCommunityMetadata,
  mergeCommunityMessageModels,
  mergeCommunityMessages,
  sendCommunityMessage,
  subscribeCommunity,
  type BitcoinWalkCommunityMessage,
} from '@/services/bitcoinwalk/community';
import { useActiveAccount } from '@/stores/active-account.store';
import { loadCities } from '@/services/bitcoinwalk/cities';
import { useSelectedCity } from '@/stores/selected-city.store';
import {
  loadBitcoinWalkChatDirectory,
  type BitcoinWalkChatDirectory,
} from '@/services/bitcoinwalk/chat-directory';
import { spacing, uiDensity, useThemeColors } from '@/theme';

const HOSTS_ACCESS_DENIED = 'HOSTS_ACCESS_DENIED';

export default function CommunityScreen() {
  const { t, i18n } = useTranslation();
  const c = useThemeColors();
  const clearance = useScreenHeaderClearance();
  const selectedCity = useSelectedCity((state) => state.selectedCity);
  const selectCity = useSelectedCity((state) => state.select);
  const accountPubkey = useActiveAccount((state) => state.activePubkey);
  const params = useLocalSearchParams<{ scope?: string; city?: string | string[] }>();
  const scope = params.scope === 'global' || params.scope === 'hosts' ? params.scope : 'city';
  const requestedCity = (Array.isArray(params.city) ? params.city[0] : params.city)?.toLowerCase();
  const city = !requestedCity || selectedCity?.slug === requestedCity ? selectedCity : null;
  const resolvingCity = !!requestedCity && !city;
  const [chatDirectory, setChatDirectory] = useState<BitcoinWalkChatDirectory | null>(null);
  const destination = scope === 'hosts'
    ? chatDirectory?.communities.hosts ?? null
    : city?.chat.communities[scope] ?? null;
  const destinationKey = destination ? `${destination.relay}\n${destination.groupId}` : null;
  const [messages, setMessages] = useState<BitcoinWalkCommunityMessage[]>([]);
  const [name, setName] = useState<string | null>(null);
  const [about, setAbout] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joinedDestinationKey, setJoinedDestinationKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const resolvingDestination = scope === 'hosts' && chatDirectory === null && loading;
  const joined = destinationKey !== null && joinedDestinationKey === destinationKey;

  useEffect(() => {
    if (scope !== 'hosts') return;
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
      const match = cities.find((candidate) => candidate.slug === requestedCity);
      if (!match) throw new Error('Unknown BitcoinWalk city');
      selectCity(match);
      setError(null);
    }).catch((cause: unknown) => {
      if ((cause as { name?: string })?.name !== 'AbortError') setError(t('community.load_error'));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [requestedCity, selectCity, selectedCity?.slug, t]);

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
      if (!signer) {
        const metadata = await loadCommunityMetadata(destination);
        setName(metadata.name);
        setAbout(metadata.about);
      } else {
        const result = await loadCommunity(destination, undefined, signer);
        if (scope === 'hosts' && (!accountPubkey || !result.roster.memberPubkeys.includes(accountPubkey))) {
          throw new Error(HOSTS_ACCESS_DENIED);
        }
        setName(result.metadata.name);
        setAbout(result.metadata.about);
        setMessages((current) => mergeCommunityMessageModels(current, result.messages));
      }
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
  }, [accountPubkey, destination, joined, scope, t]);

  useEffect(() => {
    if (!destination) return;
    const controller = new AbortController();
    let unsubscribe = () => {};
    let signer: Awaited<ReturnType<typeof buildSigner>> | null = null;
    void (async () => {
      try {
        const savedMembership = scope !== 'hosts' && accountPubkey
          ? await hasCommunityMembership(accountPubkey, destination)
          : false;
        const hasAccess = scope === 'hosts' || joined || savedMembership;
        if (hasAccess) {
          if (!accountPubkey) throw new Error('No active account');
          signer = await buildSigner(accountPubkey);
        }
        if (controller.signal.aborted) return;
        if (!signer) {
          const metadata = await loadCommunityMetadata(destination, controller.signal);
          if (controller.signal.aborted) return;
          setName(metadata.name);
          setAbout(metadata.about);
          setError(null);
          return;
        }
        const result = await loadCommunity(destination, controller.signal, signer);
        if (controller.signal.aborted) return;
        if (scope === 'hosts' && (!accountPubkey || !result.roster.memberPubkeys.includes(accountPubkey))) {
          throw new Error(HOSTS_ACCESS_DENIED);
        }
        setName(result.metadata.name);
        setAbout(result.metadata.about);
        setMessages((current) => mergeCommunityMessageModels(current, result.messages));
        setJoinedDestinationKey(destinationKey);
        setError(null);
        unsubscribe = subscribeCommunity(destination, (event) => {
          setMessages((current) => mergeCommunityMessages(current, [event], destination.groupId));
        }, signer ?? undefined);
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
      setError(t('community.join_error'));
      return;
    }
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
    : scope === 'hosts'
      ? t('community.hosts_full_title')
      : city ? t('community.city_title', { city: city.name }) : t('community.title'));
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    dateStyle: 'short', timeStyle: 'short',
  }), [i18n.resolvedLanguage]);

  return (
    <AppScreen edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={KEYBOARD_AVOIDING_BEHAVIOR}>
        {resolvingCity || resolvingDestination || !!destination && loading ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={c.accent} />
        </View> : !destination ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center',
          gap: spacing.md, padding: spacing.xl }}>
          <MessagesSquare color={c.textMuted} size={uiDensity.contactAvatarSize} />
          <AppText variant="subtitle" align="center">{t('community.unavailable')}</AppText>
          <AppText tone="muted" align="center">{t('community.unavailable_hint')}</AppText>
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
              <AppText tone="muted" align="center">
                {joined ? t('community.empty_joined_hint') : t('community.empty_hint')}
              </AppText>
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
            {error && (joined || scope !== 'hosts') ? <AppText tone="danger">{error}</AppText> : null}
            {joined ? <>
              <AppInput value={draft} onChangeText={setDraft} placeholder={t('community.message_placeholder')}
                maxLength={4_000} multiline />
              <AppButton label={t('community.send')} loading={busy} disabled={!draft.trim()}
                onPress={() => void send()} />
            </> : scope === 'hosts' ? (
              <AppText tone={error ? 'danger' : 'muted'}>
                {error ?? t('community.hosts_access_required')}
              </AppText>
            ) : <>
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
