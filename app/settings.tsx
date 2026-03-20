import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View, ScrollView, Switch } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useRouter, useNavigation } from 'expo-router';
import { CommonActions } from '@react-navigation/native';
import { useStore } from '../store/useStore';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { mapResetPasswordError, sendPasswordResetEmail, signOut } from '../services/authService';

export default function SettingsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const user = useStore((state) => state.user);
  const clearSession = useStore((state) => state.clearSession);
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
            await signOut();
            clearSession();
            navigation.dispatch(
              CommonActions.reset({
                index: 0,
                routes: [{ name: 'login' as never }],
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
          <TouchableOpacity 
            style={styles.settingRow} 
            activeOpacity={0.7}
            onPress={() => router.push('/edit-profile')}
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
    height: 120,
    backgroundColor: COLORS.primary,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    overflow: 'visible',
    zIndex: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.screenX,
    paddingTop: 10,
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