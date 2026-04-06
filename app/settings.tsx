import { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View, ScrollView, Switch, Modal, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useRouter, useNavigation } from 'expo-router';
import { CommonActions } from '@react-navigation/native';
import { useStore, type FareDiscountType } from '../store/useStore';
import { useRecentSearches } from '../hooks/useRecentSearches';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { signOut, logUserAction } from '../services/authService';
import { useTheme } from '../src/theme/ThemeContext';

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
  const notificationsEnabled = useStore((state) => state.notificationsEnabled);
  const setNotificationsEnabled = useStore((state) => state.setNotificationsEnabled);
  
  const { theme, isDark, themeMode, setThemeMode } = useTheme();
  const [isAppearanceModalVisible, setIsAppearanceModalVisible] = useState(false);

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

  const currentThemeLabel =
    themeMode === 'system' ? 'System' : themeMode === 'light' ? 'Light' : 'Dark';

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={[styles.topSection, { paddingTop: insets.top, backgroundColor: isDark ? '#E8A020' : COLORS.primary }]}>
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <View style={[styles.backButtonCircle, { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]}>
              <Ionicons name="chevron-back" size={24} color="#0A1628" />
            </View>
          </TouchableOpacity>
          
          <Text style={[styles.headerTitle, { color: '#0A1628' }]}>SETTINGS</Text>
          
          <View style={{ width: 44 }} />
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { backgroundColor: theme.background }]}>
        
        <View style={[styles.cardGroup, { backgroundColor: theme.cardBackground }]}>
          {!isGuestAccount && (
            <>
              <TouchableOpacity 
                style={styles.settingRow} 
                activeOpacity={0.7}
                onPress={() => router.navigate('/edit-profile')}
              >
                <View style={styles.rowLeft}>
                  <Feather name="user" size={20} color={theme.text} style={styles.icon} />
                  <Text style={[styles.settingLabel, { color: theme.text }]}>Edit Profile</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
              <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
              
              <View style={styles.settingRow}>
                <View style={styles.rowLeft}>
                  <Feather name="mail" size={20} color={theme.text} style={styles.icon} />
                  <Text style={[styles.settingLabel, { color: theme.text }]}>Email</Text>
                </View>
                <Text style={[styles.valueText, { color: theme.textSecondary }]}>{user?.email || 'N/A'}</Text>
              </View>
              <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
            </>
          )}

          <TouchableOpacity 
            style={styles.settingRow} 
            activeOpacity={0.7}
            onPress={() => setIsAppearanceModalVisible(true)}
          >
            <View style={styles.rowLeft}>
              <Feather name={isDark ? "moon" : "sun"} size={20} color={theme.text} style={styles.icon} />
              <Text style={[styles.settingLabel, { color: theme.text }]}>Appearance</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: theme.accent, marginRight: 8, fontSize: 16 }}>{currentThemeLabel}</Text>
              <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
            </View>
          </TouchableOpacity>
          <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />

          <View style={styles.settingRow}>
            <View style={styles.rowLeft}>
              <Feather name="bell" size={20} color={theme.text} style={styles.icon} />
              <Text style={[styles.settingLabel, { color: theme.text }]}>Notifications</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: theme.inputBackground, true: theme.accent }}
              thumbColor="#FFFFFF"
            />
          </View>
          <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />

          <View style={styles.discountSection}>
            <View style={styles.rowLeft}>
              <Feather name="tag" size={20} color={theme.text} style={styles.icon} />
              <View>
                <Text style={[styles.settingLabel, { color: theme.text }]}>Fare Type</Text>
                <Text style={[styles.helperText, { color: theme.textSecondary }]}>Student, Senior, and PWD get discounted fares.</Text>
              </View>
            </View>
            <View style={styles.discountPillRow}>
              {DISCOUNT_OPTIONS.map((option) => {
                const active = fareDiscountType === option.key;
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={[styles.discountPill, { 
                      backgroundColor: 'transparent', 
                      borderColor: active ? '#E8A020' : theme.cardBorder 
                    }]}
                    activeOpacity={0.85}
                    onPress={() => setFareDiscountType(option.key)}
                  >
                    <Text style={[styles.discountPillText, { color: active ? '#E8A020' : theme.text }]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        <View style={[styles.cardGroup, { backgroundColor: theme.cardBackground }]}>
          <TouchableOpacity style={styles.settingRow} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <Feather name="info" size={20} color={theme.text} style={styles.icon} />
              <Text style={[styles.settingLabel, { color: theme.text }]}>About Para</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
          <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
          <TouchableOpacity style={styles.settingRow} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <Feather name="shield" size={20} color={theme.text} style={styles.icon} />
              <Text style={[styles.settingLabel, { color: theme.text }]}>Privacy Policy</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[styles.logoutButton, { backgroundColor: theme.surface }]} onPress={handleLogout}>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Appearance Modal */}
      <Modal
        visible={isAppearanceModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsAppearanceModalVisible(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setIsAppearanceModalVisible(false)}
        >
          <Pressable 
            style={[styles.modalContent, { backgroundColor: theme.cardBackground }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Appearance</Text>
            </View>
            
            <TouchableOpacity 
              style={styles.modalOption}
              onPress={() => { setThemeMode('system'); setIsAppearanceModalVisible(false); }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="phone-portrait-outline" size={20} color={theme.text} style={{ marginRight: 12 }} />
                <Text style={[styles.modalOptionText, { color: theme.text }]}>System</Text>
              </View>
              {themeMode === 'system' && <Ionicons name="checkmark" size={20} color={theme.accent} />}
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.modalOption}
              onPress={() => { setThemeMode('dark'); setIsAppearanceModalVisible(false); }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="moon" size={20} color={theme.text} style={{ marginRight: 12 }} />
                <Text style={[styles.modalOptionText, { color: theme.text }]}>Dark</Text>
              </View>
              {themeMode === 'dark' && <Ionicons name="checkmark" size={20} color={theme.accent} />}
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.modalOption}
              onPress={() => { setThemeMode('light'); setIsAppearanceModalVisible(false); }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="sunny" size={20} color={theme.text} style={{ marginRight: 12 }} />
                <Text style={[styles.modalOptionText, { color: theme.text }]}>Light</Text>
              </View>
              {themeMode === 'light' && <Ionicons name="checkmark" size={20} color={theme.accent} />}
            </TouchableOpacity>

          </Pressable>
        </Pressable>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topSection: { zIndex: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.screenX, paddingVertical: 14, height: 64 },
  backButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'flex-start' },
  backButtonCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  headerTitle: { fontFamily: 'Cubao', fontSize: TYPOGRAPHY.screenTitle },
  content: { padding: SPACING.screenX, paddingTop: 24, paddingBottom: 40 },
  cardGroup: { borderRadius: RADIUS.card, marginBottom: 20, paddingVertical: 4 },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, paddingHorizontal: 16 },
  rowLeft: { flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: 12 },
  settingLabel: { fontFamily: 'Inter', fontSize: 16 },
  valueText: { fontFamily: 'Inter', fontSize: 15 },
  divider: { height: 1, marginLeft: 48 },
  discountSection: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, gap: 12 },
  helperText: { fontFamily: 'Inter', fontSize: 12, marginTop: 2 },
  discountPillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  discountPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  discountPillText: { fontFamily: 'Inter-SemiBold', fontSize: 12 },
  logoutButton: { marginTop: 10, borderRadius: RADIUS.card, paddingVertical: 16, alignItems: 'center' },
  logoutText: { fontFamily: 'SFPro-Bold', fontSize: 16, color: '#FF3B30' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', borderRadius: 20, padding: 20 },
  modalHeader: { marginBottom: 20, alignItems: 'center' },
  modalTitle: { fontFamily: 'SFPro-Bold', fontSize: 18 },
  modalOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(150,150,150,0.2)' },
  modalOptionText: { fontFamily: 'Inter', fontSize: 16 }
});