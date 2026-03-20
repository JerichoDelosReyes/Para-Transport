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
  
  const [isSendingReset, setIsSendingReset] = useState(false);

  const sendChangePasswordEmail = async () => {
    const email = user?.email?.trim();
    if (!email) {
      Alert.alert('Error', 'No account email found. Please log in again and try.');
      return;
    }

    setIsSendingReset(true);
    try {
      await sendPasswordResetEmail(email);
      Alert.alert('Success', 'If this email is registered, a password reset link has been sent.');
    } catch (err: any) {
      Alert.alert('Error', mapResetPasswordError(err?.code || err?.message));
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleChangePassword = () => {
    Alert.alert(
      'Change Password',
      'Do you want to proceed with changing your password? We will send a reset link to your email.',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', onPress: () => void sendChangePasswordEmail() },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          if (!isGuestAccount) {
            try {
              await signOut();
            } catch {}
          }
          clearSession();
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: 'index' }],
            })
          );
        },
      }
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <View style={styles.backButtonCircle}>
            <Ionicons name="chevron-back" size={24} color={COLORS.navy} />
          </View>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView style={{ flex: 1, backgroundColor: COLORS.background }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        
        <View style={styles.cardGroup}>
          <TouchableOpacity style={styles.settingRow} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <Feather name="user" size={20} color={COLORS.textStrong} style={styles.icon} />
              <Text style={styles.settingLabel}>Edit Profile</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
          <View style={styles.divider} />
          
          <TouchableOpacity style={styles.settingRow} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <Feather name="mail" size={20} color={COLORS.textStrong} style={styles.icon} />
              <Text style={styles.settingLabel}>Email</Text>
            </View>
            <Text style={styles.valueText}>{user?.email || 'N/A'}</Text>
          </TouchableOpacity>
          <View style={styles.divider} />

          <View style={styles.settingRow}>
            <View style={styles.rowLeft}>
              <Feather name="bell" size={20} color={COLORS.textStrong} style={styles.icon} />
              <Text style={styles.settingLabel}>Notifications</Text>
            </View>
            <Switch 
              trackColor={{ false: 'rgba(0,0,0,0.1)', true: COLORS.primary }}
              thumbColor={COLORS.card}
              value={true}
              style={{ transform: [{ scale: 0.9 }] }}
            />
          </View>
        </View>

        {(!isGuestAccount) && (
          <View style={styles.cardGroup}>
            <TouchableOpacity style={styles.settingRow} activeOpacity={0.7} onPress={handleChangePassword} disabled={isSendingReset}>
              <View style={styles.rowLeft}>
                <Feather name="lock" size={20} color={COLORS.textStrong} style={styles.icon} />
                <Text style={styles.settingLabel}>Change Password</Text>
              </View>
              {isSendingReset ? (
                <ActivityIndicator size="small" color={COLORS.textMuted} />
              ) : (
                <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
              )}
            </TouchableOpacity>
          </View>
        )}

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.screenX,
    paddingVertical: 12,
    backgroundColor: '#F8F9FA',
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
    backgroundColor: 'rgba(0,0,0,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 18,
    color: COLORS.navy,
  },
  content: {
    padding: SPACING.screenX,
    paddingBottom: 40,
    backgroundColor: '#F8F9FA',
  },
  cardGroup: {
    backgroundColor: '#FFFFFF', 
    borderRadius: RADIUS.card,
    marginBottom: 20,
    paddingVertical: 4,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
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
    backgroundColor: '#FF4C4C10',
    borderRadius: RADIUS.card,
    paddingVertical: 16,
    alignItems: 'center',
  },
  logoutText: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 16,
    color: '#FF4C4C',
  }
});
