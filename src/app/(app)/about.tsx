import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SquareArrowRightUp } from '@solar-icons/react-native/category/arrows/Linear/SquareArrowRightUp';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { InteractivePressable as Pressable } from '@/components/common/InteractivePressable';

import {
  BrandArtworkImage,
  prepareBrandArtworkUri,
} from '@/components/common/BrandArtworkImage';
import { AppScreen } from '@/components/common/AppScreen';
import { AppText } from '@/components/common/AppText';
import { DirectionalChevron as ChevronRight } from '@/components/common/DirectionalChevron';
import { ListGroup } from '@/components/common/ListGroup';
import { ListRow } from '@/components/common/ListRow';
import { ScreenHeader, useScreenHeaderClearance } from '@/components/common/ScreenHeader';
import { useScrolled } from '@/hooks/use-scrolled';
import { useDirectionalIconStyle } from '@/i18n/direction';
import { abbreviateNpub } from '@/lib/nostr/format';
import { npubToPubkey } from '@/lib/nostr/keys';
import { platform } from '@/platform';
import { mediaViewer } from '@/stores/media-viewer.store';
import { radius, spacing, useThemeColors } from '@/theme';

const SOURCE_CODE_URL = 'https://github.com/BitcoinWalk/walkie-talkie';
// The author's public identity, so users can open a direct message from About.
const AUTHOR_NPUB = 'npub1jr8sgwrpuk66n9evk76jnfd6wxept4k3uv2vwjw42fhvzvl3mdes38wwnw';
const AUTHOR_PUBKEY = npubToPubkey(AUTHOR_NPUB);
const ABOUT_ARTWORK_HEIGHT = 192;
const ABOUT_BRAND_MARK_SIZE = 64;

function openUrl(url: string) {
  void platform.urlOpener.openExternalUrl(url).catch(() => {});
}

/**
 * About — the app's identity (brand mark, name, version) plus the legal
 * boilerplate: license, source code, and the open-source acknowledgements.
 * The artwork opens in the shared viewer; link rows hand their URL to the
 * system browser.
 */
export default function AboutSettings() {
  const { t } = useTranslation();
  const c = useThemeColors();
  const directionalIconStyle = useDirectionalIconStyle();
  const titleClearance = useScreenHeaderClearance();
  const { scrolled, scrollProps } = useScrolled();
  const version = Constants.expoConfig?.version;
  const [openingArtwork, setOpeningArtwork] = useState(false);

  const authorNpubAbbreviated = abbreviateNpub(AUTHOR_NPUB);

  async function openArtwork() {
    if (openingArtwork) return;
    setOpeningArtwork(true);
    try {
      mediaViewer.open(await prepareBrandArtworkUri());
    } catch {
      await platform.confirmationDialog.notify({
        title: t('about.artwork_open_failed'),
        okLabel: t('common.ok'),
      });
    } finally {
      setOpeningArtwork(false);
    }
  }

  // Marks rows that leave the app for the system browser.
  const externalLink = (
    <SquareArrowRightUp size={18} color={c.textMuted} style={directionalIconStyle} />
  );
  const chevron = <ChevronRight size={18} color={c.textMuted} />;

  return (
    <AppScreen edges={[]}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingTop: titleClearance,
          paddingBottom: spacing['3xl'],
          gap: spacing.xl,
        }}
        {...scrollProps}
      >
        <View style={{ alignItems: 'center' }}>
          <Pressable
            onPress={() => void openArtwork()}
            disabled={openingArtwork}
            accessibilityRole="imagebutton"
            accessibilityLabel={t('about.view_artwork')}
            pressFeedback="delayed"
            style={({ pressed }) => ({
              width: '100%',
              height: ABOUT_ARTWORK_HEIGHT,
              borderRadius: radius.xl,
              overflow: 'hidden',
              opacity: pressed ? 0.84 : 1,
            })}
          >
            <BrandArtworkImage
              contentPosition={{ top: '80%' }}
              style={{ width: '100%', height: '100%' }}
            />
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: c.overlay, alignItems: 'center', justifyContent: 'center' },
              ]}
            >
              <View style={{ alignItems: 'center', gap: spacing.sm }}>
                <Image
                  source={require('../../../assets/images/bitcoinwalk-icon.png')}
                  contentFit="contain"
                  style={{ width: ABOUT_BRAND_MARK_SIZE, height: ABOUT_BRAND_MARK_SIZE }}
                />
                <View style={{ alignItems: 'center', gap: spacing.xs }}>
                  <AppText variant="title" weight="semibold" style={{ color: c.onOverlay }}>
                    Walkie Talkie
                  </AppText>
                  {version ? (
                    <AppText variant="caption" style={{ color: c.onOverlay }}>
                      {t('about.version', { version })}
                    </AppText>
                  ) : null}
                </View>
              </View>
            </View>
          </Pressable>
        </View>

        <ListGroup>
          <ListRow
            title={t('about.author')}
            value={`BitcoinWalk · ${authorNpubAbbreviated}`}
            trailing={chevron}
            onPress={() => router.push(`/chat/${encodeURIComponent(AUTHOR_PUBKEY)}`)}
          />
          <ListRow
            title={t('about.source_code')}
            value="BitcoinWalk/walkie-talkie"
            trailing={externalLink}
            onPress={() => openUrl(SOURCE_CODE_URL)}
          />
          <ListRow title={t('about.license')} value="MIT" trailing={chevron}
            onPress={() => router.push({ pathname: '/open-source-project', params: { id: 'psstpsst' } })} />
          <ListRow
            title={t('about.open_source')}
            trailing={chevron}
            onPress={() => router.push('/open-source')}
          />
        </ListGroup>
      </ScrollView>
      <ScreenHeader title={t('settings.about')} bordered={scrolled} />
    </AppScreen>
  );
}
