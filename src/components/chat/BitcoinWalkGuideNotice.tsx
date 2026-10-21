import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';

import { AppText } from '@/components/common/AppText';
import { IconButton } from '@/components/common/IconButton';
import { dmService } from '@/services/dm/dm.service';
import { useActiveAccount } from '@/stores/active-account.store';
import { spacing, uiDensity, iconStrokeWidth, useThemeColors } from '@/theme';

export function BitcoinWalkGuideNotice({ message }: { message: string }) {
  const c = useThemeColors();
  const { t } = useTranslation();
  const account = useActiveAccount(state => state.activePubkey);
  const [busyAccount, setBusyAccount] = useState<string | null>(null);
  const [result, setResult] = useState<{ account: string; ok: boolean } | null>(null);
  const busy = !!account && busyAccount === account;
  const recover = async () => {
    if (!account || busy || dmService.getAccountPubkey() !== account) return;
    setBusyAccount(account);
    setResult(null);
    try { await dmService.recoverStandardInbox(); setResult({account,ok:true}); }
    catch { setResult({account,ok:false}); }
    finally { setBusyAccount(current => current === account ? null : current); }
  };
  return (
    <View
      style={{
        minHeight: uiDensity.chatNoticeVerticalPadding * 2,
        justifyContent: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
        paddingVertical: uiDensity.chatNoticeVerticalPadding,
        backgroundColor: c.surfaceElevated,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: c.border,
      }}
    >
      <View style={{ flex: 1, gap: spacing.xs }}>
        <AppText variant="caption" tone="muted">
          {busy ? t('community.guide_recovery_opening') : result?.account === account
            ? t(result.ok ? 'community.guide_recovery_done' : 'community.guide_recovery_failed') : message}
        </AppText>
        {busy ? (
          <AppText variant="micro" tone="muted">
            {t('community.guide_recovery_checking')}
          </AppText>
        ) : null}
      </View>
      <IconButton
        icon={busy
          ? <ActivityIndicator size="small" color={c.guideAccent} />
          : <RefreshCw strokeWidth={iconStrokeWidth.default} size={uiDensity.headerActionIconSize} color={c.textMuted} />}
        accessibilityLabel={t('community.guide_recovery_action')}
        disabled={busy || !account}
        onPress={() => void recover()}
      />
    </View>
  );
}
