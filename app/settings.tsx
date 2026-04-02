import { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View, ScrollView, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useRouter, useNavigation } from 'expo-router';
import { CommonActions } from '@react-navigation/native';
import { useStore, type FareDiscountType } from '../store/useStore';
import { useRecentSearches } from '../hooks/useRecentSearches';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { signOut, logUserAction } from '../services/authService';

const DISCOUNT_OPTIONS: Array<{ key: FareDiscountType; label: string }> = [
  { key: 'regular', label: 'Regular' },
  { key: 'student', label: 'Student' },
  { key: 'senior', label: 'Senior' },
  { key: 'pwd', label: 'PWD' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const user = useStore((state) => state.user);
  const fareDiscountType = useStore((state) => state.user.fare_discount_type || 'regular');
  const setFareDiscountType = useStore((state) => state.setFareDiscountType);
  const clearSession = useStore((state) => state.clearSession);
  const resetProgress = useStore((state) => state.resetProgress);
  const { clearRecents } = useRecentSearches();
  const isGuestAccount = (user?.email || '').trim().toLowerCase() === 'guest@para.ph';
  const insets = useSafeAreaInsets();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          try {
            if (!isGuestAccount) {
              if (user?.id) await logUserAction(user.id, 'Logged out');
              await signOut();
            } else {
              // Guest-mode data is local only; clear it on logout.
              clearRecents();
              resetProgress();
            }
            clearSession();
            navigation.dispatch(
              CommonActions.reset({
                index: 0,
                routes: [{ name: 'index' as never }],
              })
            );
          } catch (error) {
            console.error('Logout error', error);
            Alert.alert('Error', 'Failed to log out. Please try again.');
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.topSection, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <View style={styles.backButtonCircle}>
              <Ionicons name="chevron-back" size={24} color={COLORS.navy} />
            </View>
          </TouchableOpacity>
          
          <Text style={styles.headerTitle}>SETTINGS</Text>
          
          <View style={{ width: 44 }} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        <View style={styles.cardGroup}>
          {!isGuestAccount && (
            <>
              <TouchableOpacity 
                style={styles.settingRow} 
                activeOpacity={0.7}
                onPress={() => router.navigate('/edit-profile')}
              >
                <View style={styles.rowLeft}>
                  <Feather name="user" size={20} color={COLORS.textStrong} style={styles.icon} />
                  <Text style={styles.settingLabel}>Edit Profile</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
              <View style={styles.divider} />
              
              <View style={styles.settingRow}>
                <View style={styles.rowLeft}>
                  <Feather name="mail" size={20} color={COLORS.textStrong} style={styles.icon} />
                  <Text style={styles.settingLabel}>Email</Text>
                </View>
                <Text style={styles.valueText}>{user?.email || 'N/A'}</Text>
              </View>
              <View style={styles.divider} />
            </>
          )}

          <View style={styles.settingRow}>
            <View style={styles.rowLeft}>
              <Feather name="bell" size={20} color={COLORS.textStrong} style={styles.icon} />
              <Text style={styles.settingLabel}>Notifications</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: '#E0E0E0', true: COLORS.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
          <View style={styles.divider} />

          <View style={styles.discountSection}>
            <View style={styles.rowLeft}>
              <Feather name="tag" size={20} color={COLORS.textStrong} style={styles.icon} />
              <View>
                <Text style={styles.settingLabel}>Fare Type</Text>
                <Text style={styles.helperText}>Student, Senior, and PWD get discounted fares.</Text>
              </View>
            </View>
            <View style={styles.discountPillRow}>
              {DISCOUNT_OPTIONS.map((option) => {
                const active = fareDiscountType === option.key;
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={[styles.discountPill, active && styles.discountPillActive]}
                    activeOpacity={0.85}
                    onPress={() => setFareDiscountType(option.key)}
                  >
                    <Text style={[styles.discountPillText, active && styles.discountPillTextActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        <View style={styles.cardGroup}>
          <TouchableOpacity style={styles.settingRow} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <Feather name="info" size={20} color={COLORS.textStrong} style={styles.icon} />
              <Text style={styles.settingLabel}>About Para</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.settingRow} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <Feather name="shield" size={20} color={COLORS.textStrong} style={styles.icon} />
              <Text style={styles.settingLabel}>Privacy Policy</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  topSection: {
    backgroundColor: COLORS.primary,
    zIndex: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.screenX,
    paddingVertical: 14,
    height: 64,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  backButtonCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  headerTitle: {
    fontFamily: 'Cubao',
    fontSize: TYPOGRAPHY.screenTitle,
    color: '#000000',
  },
  content: {
    padding: SPACING.screenX,
    paddingTop: 24,
    paddingBottom: 40,
    backgroundColor: COLORS.background,
  },
  cardGroup: {
    backgroundColor: COLORS.card, 
    borderRadius: RADIUS.card,
    marginBottom: 20,
    paddingVertical: 4,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 12,
  },
  settingLabel: {
    fontFamily: 'Inter',
    fontSize: 16,
    color: '#333333',
  },
  valueText: {
    fontFamily: 'Inter',
    fontSize: 15,
    color: COLORS.textMuted,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginLeft: 48,
  },
  discountSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    gap: 12,
  },
  helperText: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  discountPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  discountPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(10,22,40,0.12)',
    backgroundColor: '#FFFFFF',
  },
  discountPillActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(232,160,32,0.14)',
  },
  discountPillText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: COLORS.textStrong,
  },
  discountPillTextActive: {
    color: COLORS.navy,
  },
  logoutButton: {
    marginTop: 10,
    backgroundColor: '#FFF0F0',
    borderRadius: RADIUS.card,
    paddingVertical: 16,
    alignItems: 'center',
  },
  logoutText: {
    fontFamily: 'SFPro-Bold',
    fontSize: 16,
    color: '#FF3B30',
  }
});