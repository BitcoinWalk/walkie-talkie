import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BitcoinWalkCommunityView } from '@/app/(app)/community';
import {
  BitcoinWalkChatRail,
  type BitcoinWalkChatDestination,
} from '@/components/bitcoinwalk/BitcoinWalkChatRail';
import { AppScreen } from '@/components/common/AppScreen';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { communityChoicesForCity } from '@/services/bitcoinwalk/cities';
import {
  loadBitcoinWalkChatDirectory,
  type BitcoinWalkChatDirectory,
} from '@/services/bitcoinwalk/chat-directory';
import { BITCOINWALK_ORIGIN } from '@/services/bitcoinwalk/config';
import { buildSigner } from '@/services/account/account.service';
import { hasActiveCommunityMembership } from '@/services/bitcoinwalk/community';
import { useActiveAccount } from '@/stores/active-account.store';
import { useBitcoinWalkCommunity } from '@/stores/bitcoinwalk-community.store';
import { useSelectedCity } from '@/stores/selected-city.store';
import { bottomBarHeight, headerHeight } from '@/theme';

const GLOBAL_COMMUNITY_AVATAR = require('../../../../assets/images/bitcoinwalk-icon.png') as number;

export default function BitcoinWalkChatsTab() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const accountPubkey = useActiveAccount((state) => state.activePubkey);
  const city = useSelectedCity((state) => state.selectedCity)!;
  const scope = useBitcoinWalkCommunity((state) => state.scope);
  const selectScope = useBitcoinWalkCommunity((state) => state.select);
  const previousCity = useRef(city.id);
  const choices = useMemo(() => communityChoicesForCity(city), [city]);
  const [directory, setDirectory] = useState<BitcoinWalkChatDirectory | null>(null);
  const [hostsAccess, setHostsAccess] = useState<{ key: string; active: boolean } | null>(null);
  const hostsDestination = directory?.communities.hosts ?? null;
  const hostsAccessKey = accountPubkey && hostsDestination
    ? `${accountPubkey}\n${hostsDestination.relay}\n${hostsDestination.groupId}`
    : null;
  const hostsAvailable = hostsAccessKey !== null && hostsAccess?.key === hostsAccessKey && hostsAccess.active;
  const displayedScope = scope === 'hosts' && !hostsAvailable ? 'city' : scope;

  useEffect(() => {
    if (previousCity.current !== city.id) {
      previousCity.current = city.id;
      selectScope('city');
    }
  }, [city.id, selectScope]);

  useEffect(() => {
    const controller = new AbortController();
    void loadBitcoinWalkChatDirectory(controller.signal)
      .then((result) => { if (!controller.signal.aborted) setDirectory(result); })
      .catch(() => { if (!controller.signal.aborted) setDirectory(null); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const destination = hostsDestination;
    const controller = new AbortController();
    if (!accountPubkey || !destination || !hostsAccessKey) return () => controller.abort();
    let signer: Awaited<ReturnType<typeof buildSigner>> | null = null;
    void (async () => {
      try {
        signer = await buildSigner(accountPubkey);
        const active = await hasActiveCommunityMembership(destination, signer, controller.signal);
        if (!controller.signal.aborted) setHostsAccess({ key: hostsAccessKey, active });
      } catch {
        if (!controller.signal.aborted) setHostsAccess({ key: hostsAccessKey, active: false });
      } finally {
        await signer?.destroy?.();
      }
    })();
    return () => {
      controller.abort();
      void signer?.destroy?.();
    };
  }, [accountPubkey, hostsAccessKey, hostsDestination]);

  useEffect(() => {
    if (scope === 'hosts' && hostsAccessKey === null) selectScope('city');
    if (scope === 'hosts' && hostsAccess?.key === hostsAccessKey && !hostsAccess.active) {
      selectScope('city');
    }
  }, [hostsAccess, hostsAccessKey, scope, selectScope]);

  const destinations = useMemo<BitcoinWalkChatDestination[]>(() => {
    const cityAvailable = choices.some((choice) => choice.scope === 'city');
    const globalAvailable = choices.some((choice) => choice.scope === 'global');
    const guidePubkey = directory?.guidePubkey ?? null;
    const publicDestinations: BitcoinWalkChatDestination[] = [
      {
        key: 'city', title: t('community.city_short'), subtitle: city.name,
        picture: city.avatarUrl, available: cityAvailable, active: displayedScope === 'city',
        onPress: () => selectScope('city'),
      },
      {
        key: 'guide', title: t('community.guide_title'),
        subtitle: accountPubkey ? t('community.guide_subtitle') : t('community.sign_in_required_short'),
        picture: `${BITCOINWALK_ORIGIN}/brand/bitcoinwalk-admin-favicon.png`,
        available: !!accountPubkey && !!guidePubkey,
        onPress: () => {
          if (guidePubkey) router.push(`/chat/${guidePubkey}?mode=guide&name=${encodeURIComponent(t('community.guide_full_title'))}`);
        },
      },
      {
        key: 'global', title: t('community.global_short'), subtitle: t('community.global_subtitle'),
        picture: GLOBAL_COMMUNITY_AVATAR, available: globalAvailable, active: displayedScope === 'global',
        onPress: () => selectScope('global'),
      },
    ];
    if (hostsAvailable) {
      publicDestinations.push({
        key: 'hosts', title: t('community.hosts_title'), subtitle: t('community.hosts_subtitle'),
        fallbackLabel: 'BW', available: true,
        active: displayedScope === 'hosts', onPress: () => selectScope('hosts'),
      });
    }
    return publicDestinations;
  }, [accountPubkey, choices, city, directory, displayedScope, hostsAvailable, selectScope, t]);

  return (
    <AppScreen edges={[]}>
      <View style={{ flex: 1, paddingTop: headerHeight + insets.top,
        paddingBottom: bottomBarHeight + insets.bottom }}>
        <BitcoinWalkChatRail label={t('community.rail_label')} destinations={destinations} />
        <View style={{ flex: 1 }}>
          <BitcoinWalkCommunityView key={`${city.id}:${displayedScope}`} embedded embeddedScope={displayedScope} />
        </View>
      </View>
      <ScreenHeader back={false} title={t('tabs.conversations')} />
    </AppScreen>
  );
}
