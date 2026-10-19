import MapPin from 'lucide-react-native/icons/map-pin';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import type { WebViewOpenWindowEvent } from 'react-native-webview/lib/WebViewTypes';

import { AppButton } from '@/components/common/AppButton';
import { AppText } from '@/components/common/AppText';
import { platform } from '@/platform';
import { appCityPageUrl, communityScopeForCityPageUrl, type PublicCommunityScope } from '@/services/bitcoinwalk/city-page-links';
import type { BitcoinWalkCity } from '@/services/bitcoinwalk/cities';
import { BITCOINWALK_ORIGIN } from '@/services/bitcoinwalk/config';
import { iconStrokeWidth } from '@/theme/icons';
import { spacing, uiDensity, useThemeColors } from '@/theme';

type Props = {
  city: BitcoinWalkCity;
  bottomClearance: number;
  onChangeCity: () => void;
  onOpenCommunity: (scope: PublicCommunityScope) => void;
};

// The canonical website currently uses CSS system colours. Android WebView
// otherwise resolves those against the app's dark appearance while parts of
// the page remain explicitly light, producing black text on a black canvas.
const LIGHT_CITY_PAGE_SCRIPT = `
  (function () {
    document.documentElement.style.colorScheme = 'light';
  })();
  true;
`;

export function BitcoinWalkCityPage({ city, bottomClearance, onChangeCity, onOpenCommunity }: Props) {
  const { t } = useTranslation();
  const c = useThemeColors();
  const webView = useRef<WebView>(null);
  const [failed, setFailed] = useState(false);

  function handleUrl(url: string): boolean {
    const scope = communityScopeForCityPageUrl(city, url);
    if (scope) {
      onOpenCommunity(scope);
      return false;
    }
    try {
      if (new URL(url).origin === BITCOINWALK_ORIGIN) return true;
    } catch {
      return false;
    }
    void platform.urlOpener.openExternalUrl(url).catch(() => {});
    return false;
  }

  return (
    <View style={{ flex: 1, paddingBottom: bottomClearance }}>
      {failed ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md,
          padding: spacing.xl }}>
          <MapPin color={c.textMuted} size={uiDensity.contactAvatarSize} />
          <AppText variant="subtitle" align="center">{t('walks.city_page_error')}</AppText>
          <AppText tone="muted" align="center">{t('walks.city_page_error_hint')}</AppText>
          <AppButton variant="secondary" label={t('walks.retry')} onPress={() => {
            setFailed(false);
            webView.current?.reload();
          }} />
        </View>
      ) : (
        <WebView
          ref={webView}
          source={{ uri: appCityPageUrl(city.canonicalUrl) }}
          originWhitelist={['https://*']}
          onShouldStartLoadWithRequest={(request: WebViewNavigation) => handleUrl(request.url)}
          onOpenWindow={(event: WebViewOpenWindowEvent) => { handleUrl(event.nativeEvent.targetUrl); }}
          onError={() => setFailed(true)}
          forceDarkOn={false}
          injectedJavaScriptBeforeContentLoaded={LIGHT_CITY_PAGE_SCRIPT}
          injectedJavaScript={LIGHT_CITY_PAGE_SCRIPT}
          startInLoadingState
          renderLoading={() => <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center',
            backgroundColor: c.background }}><ActivityIndicator color={c.accent} /></View>}
          setSupportMultipleWindows={false}
          style={{ flex: 1, backgroundColor: c.background }}
        />
      )}
      <View style={{ alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, backgroundColor: c.background }}>
        <AppButton variant="secondary" size="sm" compact corner="full" fullWidth={false}
          label={t('walks.change_city')}
          iconLeft={<MapPin color={c.text} size={uiDensity.headerActionIconSize}
            strokeWidth={iconStrokeWidth.default} />}
          onPress={onChangeCity} />
      </View>
    </View>
  );
}
