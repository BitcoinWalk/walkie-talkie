import { forwardRef, type ReactNode, useState } from 'react';
import { StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { radius, spacing, typography, uiDensity, useThemeColors } from '@/theme';

import { AppText } from './AppText';

type Props = TextInputProps & {
  invalid?: boolean;
  /** Short field name. Always rendered above the control as a muted caption. */
  label?: string;
  labelAccessory?: ReactNode;
  /** Supporting copy. Always rendered below the control as a muted caption. */
  description?: string;
  /** Current validation error. Replaces `description` and marks the field invalid. */
  error?: string;
  /** Control rendered beside the input, such as a scan or add action. */
  trailingAccessory?: ReactNode;
  /** Compact control rendered inside the input at its logical end. */
  inputTrailingAccessory?: ReactNode;
  /** A bounded, growing message field rather than a full multiline form. */
  compact?: boolean;
};

export const AppInput = forwardRef<TextInput, Props>(function AppInput(
  {
    invalid,
    label,
    labelAccessory,
    description,
    error,
    trailingAccessory,
    inputTrailingAccessory,
    compact = false,
    style,
    onFocus,
    onBlur,
    onChangeText,
    onContentSizeChange,
    accessibilityLabel,
    placeholder,
    value,
    defaultValue,
    ...rest
  },
  ref,
) {
  const c = useThemeColors();
  const [focused, setFocused] = useState(false);
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? '');
  const [contentHeight, setContentHeight] = useState(0);

  const hasError = invalid === true || error != null;
  const supportingText = error ?? description;
  const borderColor = hasError ? c.danger : focused ? c.accent : c.border;
  const multiline = rest.multiline ?? false;
  const currentValue = value ?? uncontrolledValue;
  const showTruncatedPlaceholder = !multiline && placeholder != null && currentValue.length === 0;
  const textAlign = StyleSheet.flatten(style)?.textAlign;

  const input = (
    <View
      style={{
        borderWidth: 1,
        borderColor,
        borderRadius: radius.lg,
        backgroundColor: c.surfaceElevated,
        paddingHorizontal: uiDensity.inputHorizontalPadding,
        height: multiline ? undefined : uiDensity.inputHeight,
        minHeight: multiline ? (compact ? uiDensity.inputHeight : uiDensity.multilineInputMinHeight) : undefined,
        maxHeight: multiline && compact ? uiDensity.inputHeight * 3 : undefined,
        paddingVertical: multiline ? (compact ? spacing.sm : spacing.md) : 0,
        justifyContent: multiline ? 'flex-start' : 'center',
        flexDirection: 'row',
        alignItems: multiline ? 'flex-start' : 'center',
      }}
    >
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row' }}>
        {showTruncatedPlaceholder ? (
          <View
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            style={{
              position: 'absolute',
              insetBlock: 0,
              insetInline: 0,
              justifyContent: 'center',
            }}
          >
            <AppText
              variant="body"
              tone="muted"
              numberOfLines={1}
              ellipsizeMode="tail"
              style={textAlign == null ? undefined : { textAlign }}
            >
              {placeholder}
            </AppText>
          </View>
        ) : null}
        <TextInput
          ref={ref}
          placeholderTextColor={c.textMuted}
          {...rest}
          value={value}
          defaultValue={defaultValue}
          placeholder={multiline ? placeholder : undefined}
          multiline={multiline}
          numberOfLines={multiline ? rest.numberOfLines : 1}
          accessibilityLabel={accessibilityLabel ?? label ?? placeholder}
          onChangeText={(nextValue) => {
            setUncontrolledValue(nextValue);
            onChangeText?.(nextValue);
          }}
          onContentSizeChange={(event) => {
            if (compact) setContentHeight(event.nativeEvent.contentSize.height);
            onContentSizeChange?.(event);
          }}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            {
              color: c.text,
              fontSize: typography.body.fontSize,
              lineHeight: typography.body.fontFamily ? typography.body.lineHeight : undefined,
              fontFamily: typography.body.fontFamily,
              flex: 1,
              height: multiline && compact ? Math.min(uiDensity.inputHeight * 3 - spacing.sm * 2,
                Math.max(uiDensity.inputHeight - spacing.sm * 2, contentHeight)) : undefined,
              paddingVertical: 0,
              // The shell owns the inset; native padding would offset the caret
              // from the separately rendered single-line placeholder.
              paddingStart: 0,
              paddingEnd: 0,
              textAlignVertical: multiline ? 'top' : 'center',
            },
            style,
          ]}
        />
      </View>
      {inputTrailingAccessory ? (
        <View style={{ flexShrink: 0 }}>{inputTrailingAccessory}</View>
      ) : null}
    </View>
  );

  const control =
    trailingAccessory == null ? (
      input
    ) : (
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <View style={{ flex: 1 }}>{input}</View>
        {trailingAccessory}
      </View>
    );

  if (label == null && supportingText == null && trailingAccessory == null) return input;

  return (
    <View style={{ gap: spacing.xs }}>
      {label != null ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <AppText variant="caption" tone="muted">{label}</AppText>
          {labelAccessory}
        </View>
      ) : null}
      {control}
      {supportingText != null ? (
        <AppText variant="caption" tone={hasError ? 'danger' : 'muted'}>
          {supportingText}
        </AppText>
      ) : null}
    </View>
  );
});
