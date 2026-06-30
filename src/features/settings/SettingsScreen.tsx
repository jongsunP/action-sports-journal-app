import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { RootStackParamList } from '../../navigation/types';
import {
  useAppTheme,
  type AppThemeColors,
  type ThemePreference,
} from '../../theme';

type SettingsScreenProps = NativeStackScreenProps<RootStackParamList, 'Settings'>;
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

const THEME_PREFERENCE_OPTIONS: Array<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: ThemePreference;
}> = [
  {
    icon: 'phone-portrait-outline',
    label: '시스템',
    value: 'system',
  },
  {
    icon: 'sunny-outline',
    label: '라이트',
    value: 'light',
  },
  {
    icon: 'moon-outline',
    label: '다크',
    value: 'dark',
  },
];

export function SettingsScreen({ navigation }: SettingsScreenProps) {
  const theme = useAppTheme();
  const styles = createStyles(theme.colors, theme.mode);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="설정 화면 닫기"
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [
            styles.closeButton,
            pressed ? styles.buttonPressed : undefined,
          ]}
        >
          <Text style={styles.closeButtonText}>‹</Text>
        </Pressable>
        <View style={styles.headerTitleBlock}>
          <Text style={styles.title}>앱 설정</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>계정</Text>
          <Pressable
            accessibilityLabel="계정 보호 및 복구 화면 열기"
            accessibilityRole="button"
            onPress={() => navigation.navigate('AccountRecovery')}
            style={({ pressed }) => [
              styles.actionCard,
              pressed ? styles.buttonPressed : undefined,
            ]}
          >
            <View style={styles.actionIcon}>
              <Ionicons
                color={theme.colors.accent}
                name="shield-checkmark-outline"
                size={22}
              />
            </View>
            <View style={styles.actionBody}>
              <Text style={styles.actionTitle}>계정 보호 / 복구</Text>
            </View>
            <Ionicons
              color={theme.colors.textMuted}
              name="chevron-forward"
              size={18}
            />
          </Pressable>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>화면 모드</Text>
            <Text style={styles.sectionMeta}>
              현재 {theme.mode === 'light' ? '라이트' : '다크'}
            </Text>
          </View>
          <View style={styles.themeOptionRow}>
            {THEME_PREFERENCE_OPTIONS.map((option) => {
              const isSelected = theme.preference === option.value;

              return (
                <Pressable
                  accessibilityLabel={`${option.label} 화면 모드 선택`}
                  accessibilityRole="button"
                  key={option.value}
                  onPress={() => {
                    void theme.setPreference(option.value);
                  }}
                  style={({ pressed }) => [
                    styles.themeOption,
                    isSelected ? styles.themeOptionSelected : undefined,
                    pressed ? styles.buttonPressed : undefined,
                  ]}
                >
                  <Ionicons
                    color={
                      isSelected
                        ? theme.colors.background
                        : theme.colors.textSecondary
                    }
                    name={option.icon}
                    size={22}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>QA 진단 패널</Text>
          <View style={styles.infoCard}>
            <Ionicons color={theme.colors.accent} name="bug-outline" size={20} />
            <Text style={styles.infoText}>
              현재 QA 빌드에서만 표시합니다.
            </Text>
          </View>
        </View>

        <View style={styles.footerSpacer} />
        <Text style={styles.versionText}>Wake Board {APP_VERSION}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: AppThemeColors, mode: 'dark' | 'light') {
  const isLight = mode === 'light';
  const borderSoft = isLight ? '#dbe4ee' : 'rgba(255, 255, 255, 0.09)';
  const borderStrong = isLight ? '#cbd5e1' : 'rgba(148, 163, 184, 0.22)';
  const subtleSurface = isLight ? '#f1f5f9' : 'rgba(148, 163, 184, 0.1)';

  return StyleSheet.create({
    screen: {
      backgroundColor: colors.background,
      flex: 1,
    },
    header: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 4,
    },
    closeButton: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: borderStrong,
      borderRadius: 999,
      borderWidth: 1,
      height: 38,
      justifyContent: 'center',
      width: 38,
    },
    closeButtonText: {
      color: colors.textPrimary,
      fontSize: 30,
      fontWeight: '800',
      lineHeight: 32,
    },
    headerTitleBlock: {
      alignItems: 'center',
      flex: 1,
      paddingHorizontal: 10,
    },
    headerSpacer: {
      height: 38,
      width: 38,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 24,
      fontWeight: '900',
      lineHeight: 29,
    },
    body: {
      flexGrow: 1,
      gap: 14,
      padding: 16,
      paddingBottom: 28,
    },
    section: {
      backgroundColor: colors.surface,
      borderColor: borderSoft,
      borderRadius: 18,
      borderWidth: 1,
      gap: 11,
      padding: 15,
    },
    sectionHeaderRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    sectionTitle: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: '900',
      lineHeight: 23,
    },
    sectionMeta: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '800',
    },
    actionCard: {
      alignItems: 'center',
      backgroundColor: colors.surfaceElevated,
      borderColor: borderSoft,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    actionIcon: {
      alignItems: 'center',
      backgroundColor: isLight ? '#ecfeff' : 'rgba(3, 199, 90, 0.1)',
      borderColor: isLight ? '#99f6e4' : 'rgba(3, 199, 90, 0.22)',
      borderRadius: 999,
      borderWidth: 1,
      height: 38,
      justifyContent: 'center',
      width: 38,
    },
    actionBody: {
      flex: 1,
      minWidth: 0,
    },
    actionTitle: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '900',
    },
    actionText: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 17,
      marginTop: 2,
    },
    themeOptionRow: {
      flexDirection: 'row',
      gap: 8,
    },
    themeOption: {
      alignItems: 'center',
      backgroundColor: colors.surfaceElevated,
      borderColor: borderSoft,
      borderRadius: 14,
      borderWidth: 1,
      flex: 1,
      justifyContent: 'center',
      minHeight: 54,
      paddingHorizontal: 8,
      paddingVertical: 0,
    },
    themeOptionSelected: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    infoCard: {
      alignItems: 'center',
      backgroundColor: subtleSurface,
      borderColor: borderSoft,
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 10,
      padding: 12,
    },
    infoText: {
      color: colors.textSecondary,
      flex: 1,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 17,
    },
    footerSpacer: {
      flex: 1,
      minHeight: 28,
    },
    versionText: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
      textAlign: 'center',
    },
    buttonPressed: {
      opacity: 0.78,
    },
  });
}
