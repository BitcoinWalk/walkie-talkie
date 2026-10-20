import MessagesSquare from 'lucide-react-native/icons/messages-square';
import Send from 'lucide-react-native/icons/send';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { AppButton } from '@/components/common/AppButton';
import { IconButton } from '@/components/common/IconButton';
import { AppInput } from '@/components/common/AppInput';
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
  hasActiveCommunityMembership,
  mergeCommunityMessages,
  sendCommunityMessage,
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
import { radius, spacing, uiDensity, useThemeColors } from '@/theme';

const HOSTS_ACCESS_DENIED = 'HOSTS_ACCESS_DENIED';

type Props = {
  embedded?: boolean;
  embeddedScope?: 'city' | 'global' | 'hosts';
};

export function BitcoinWalkCommunityView({ embedded = false, embeddedScope }: Props) {
  const { t, i18n } = useTranslation();
  const c = useThemeColors();
  const screenClearance = useScreenHeaderClearance();
  const clearance = embedded ? 0 : screenClearance;
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joinedDestinationKey, setJoinedDestinationKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const resolvingDestination = scope !== 'city' && destination === null && loading;
  const joined = destinationKey !== null && joinedDestinationKey === destinationKey;
  const visibleMessages = loadedDestinationKey === destinationKey ? messages : [];
  const visibleName = loadedDestinationKey === destinationKey ? name : null;

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
          previousEventIds: visibleMessages.filter((message) => message.pubkey !== accountPubkey)
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

  const title = visibleName ?? (scope === 'global'
    ? t('community.global_title')
    : scope === 'hosts'
      ? t('community.hosts_full_title')
      : city ? t('community.city_title', { city: city.name }) : t('community.title'));
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    dateStyle: 'short', timeStyle: 'short',
  }), [i18n.resolvedLanguage]);

  const content = (
      <KeyboardAvoidingView style={{ flex: 1, paddingTop: clearance }} behavior="padding" automaticOffset>
        {resolvingCity || resolvingDestination || !!destination && loading ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={c.accent} />
        </View> : !destination ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center',
          gap: spacing.md, padding: spacing.xl }}>
          <MessagesSquare color={c.textMuted} size={uiDensity.contactAvatarSize} />
          <AppText variant="subtitle" align="center">{t('community.unavailable')}</AppText>
          <AppText tone="muted" align="center">{t('community.unavailable_hint')}</AppText>
        </View> : <>
          <FlatList
            data={visibleMessages}
            keyExtractor={(message) => message.id}
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingHorizontal: spacing.lg,
              paddingTop: spacing.sm, paddingBottom: spacing.lg, gap: spacing.sm }}
            ListEmptyComponent={<View style={{ alignItems: 'center', gap: spacing.sm, padding: spacing.xl }}>
              <MessagesSquare color={c.textMuted} size={uiDensity.tabIconSize} />
              <AppText variant="subtitle">{t('community.empty')}</AppText>
              <AppText tone="muted" align="center">
                {joined ? t('community.empty_joined_hint') : t('community.empty_hint')}
              </AppText>
            </View>}
            renderItem={({ item }) => <View style={{ gap: spacing.xs,
              alignSelf: item.pubkey === accountPubkey ? 'flex-end' : 'flex-start',
              maxWidth: '88%', padding: spacing.md, borderRadius: radius.lg,
              backgroundColor: item.pubkey === accountPubkey ? c.accentSoft : c.surface }}>
              <AppText variant="caption" tone="muted" numberOfLines={1}>
                {item.pubkey === accountPubkey ? t('community.you') : `${item.pubkey.slice(0, 12)}…`}
              </AppText>
              <AppText>{item.content}</AppText>
              <AppText variant="caption" tone="muted">
                {dateFormatter.format(new Date(item.createdAt * 1_000))}
              </AppText>
            </View>}
          />
          <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: c.border, gap: spacing.sm }}>
            {error && (joined || scope !== 'hosts') ? <AppText tone="danger">{error}</AppText> : null}
            {joined ? <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <AppInput value={draft} onChangeText={setDraft} placeholder={t('community.message_placeholder')}
                  maxLength={4_000} multiline compact />
              </View>
              <IconButton accessibilityLabel={t('community.send')} disabled={busy || !draft.trim()}
                icon={busy ? <ActivityIndicator color={c.textMuted} /> : <Send color={c.accent} size={uiDensity.headerActionIconSize} />}
                onPress={() => void send()} />
            </View> : scope === 'hosts' ? (
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
          </View>
        </>}
      </KeyboardAvoidingView>
  );

  if (embedded) return content;

  return (
    <AppScreen edges={['bottom']}>
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
