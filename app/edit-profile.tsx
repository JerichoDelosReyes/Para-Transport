import { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useStore } from '../store/useStore';
import { useTheme } from '../src/theme/ThemeContext';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import { supabase } from '../config/supabaseClient';
import { loginWithEmailPassword } from '../services/authService';

export default function EditProfileScreen() {
  const { theme, isDark } = useTheme();
  const router = useRouter();
  const user = useStore((state) => state.user);
  const setUser = useStore((state) => state.setUser);
  const resetProgress = useStore((state) => state.resetProgress);
  const insets = useSafeAreaInsets();
  
  const [name, setName] = useState(user?.full_name || '');
  const [isSaving, setIsSaving] = useState(false);
  
  const [isResetModalVisible, setIsResetModalVisible] = useState(false);
  const [resetPasswordInput, setResetPasswordInput] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  
  const isGuestAccount = (user?.email || '').trim().toLowerCase() === 'guest@para.ph';

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Name cannot be empty.');
      return;
    }
    
    if (isGuestAccount) {
      Alert.alert('Guest Account', 'You cannot edit the profile of a guest account.');
      return;
    }

    setIsSaving(true);
    try {
      if (user?.email) {
        const { error } = await supabase
          .from('users')
          .update({ full_name: name.trim() })
          .eq('email', user.email);

        if (error && error.code !== 'PGRST204' && !error.message.includes("Could not find")) {
          console.log('Supabase update failed:', error.message);
        }
      }
      
      setUser({ ...user, full_name: name.trim() } as any);
      Alert.alert('Success', 'Profile updated successfully!', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (err: any) {
      console.error('Error updating profile:', err);
      Alert.alert('Error', err.message || 'Failed to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!user?.email) {
      Alert.alert('Error', 'No email address associated with your account.');
      return;
    }
    
    Alert.alert(
      'Reset Password',
      `Send a password reset email to ${user.email}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Send Email', 
          onPress: async () => {
            try {
              const { error } = await supabase.auth.resetPasswordForEmail(user.email);
              
              if (error) {
                Alert.alert('Error', error.message);
              } else {
                Alert.alert('Success', 'Password reset email sent! Check your inbox.');
              }
            } catch (err: any) {
              Alert.alert('Error', 'Failed to send password reset email.');
            }
          }
        }
      ]
    );
  };

  const handleConfirmResetProgress = async () => {
    if (!resetPasswordInput) {
      Alert.alert('Error', 'Please enter your password to confirm.');
      return;
    }

    setIsResetting(true);
    try {
      if (!isGuestAccount && user?.email) {
        // verify password
        await loginWithEmailPassword(user.email, resetPasswordInput);
      }
      
      resetProgress();
      
      setIsResetModalVisible(false);
      setResetPasswordInput('');
      Alert.alert('Success', 'Your progress has been reset.');
    } catch (err: any) {
      console.error(err);
      const errorMsg = err?.message || 'Incorrect password or failed to reset progress.';
      Alert.alert('Error', errorMsg);
    } finally {
      setIsResetting(false);
    }
  };

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
          
          <Text style={[styles.headerTitle, { color: '#0A1628' }]}>EDIT</Text>
          
          <TouchableOpacity 
            style={styles.saveButton}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
               <View style={[styles.saveButtonCircle, { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]}>
                 <ActivityIndicator size="small" color="#0A1628" />
               </View>
            ) : (
               <View style={[styles.saveButtonCircle, { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]}>
                 <Ionicons name="checkmark" size={24} color="#0A1628" />
               </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.content, { backgroundColor: theme.background }]}>
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Full Name</Text>
          <TextInput
            style={[styles.input, { backgroundColor: isDark ? theme.inputBackground : '#FFFFFF', color: theme.text }]}
            value={name}
            onChangeText={setName}
            placeholder="Enter your full name"
            placeholderTextColor={theme.textSecondary}
            editable={!isGuestAccount}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Email</Text>
          <TextInput
            style={[styles.input, styles.inputDisabled, { backgroundColor: isDark ? theme.inputBackground : '#FFFFFF', color: theme.textSecondary }]}
            value={user?.email || ''}
            editable={false}
          />
        </View>
        
        {isGuestAccount && (
          <Text style={[styles.guestNotice, { color: theme.textSecondary }]}>
            Profile cannot be modified for guest accounts.
          </Text>
        )}

        {!isGuestAccount && (
          <>
            <TouchableOpacity 
              style={[styles.changePasswordButton, { backgroundColor: theme.cardBackground }]}
              onPress={handleResetPassword}
            >
              <Ionicons name="lock-closed-outline" size={20} color={theme.text} />
              <Text style={[styles.changePasswordText, { color: theme.text }]}>Change Password</Text>
              <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} style={styles.chevronIcon} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.changePasswordButton, { marginTop: 12, backgroundColor: isDark ? 'rgba(211, 47, 47, 0.15)' : '#FFEBEE' }]}
              onPress={() => setIsResetModalVisible(true)}
            >
              <Ionicons name="warning-outline" size={20} color="#D32F2F" />
              <Text style={[styles.changePasswordText, { color: '#D32F2F' }]}>Reset Progress</Text>
              <Ionicons name="chevron-forward" size={20} color="#D32F2F" style={styles.chevronIcon} />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Password Prompt Modal for Reset Progress */}
      <Modal
        visible={isResetModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsResetModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: theme.cardBackground }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Reset Progress</Text>
            <Text style={[styles.modalDescription, { color: theme.textSecondary }]}>
              This will permanently delete your scores, achievements, saved places, and history. Please enter your password to confirm.
            </Text>
            
            <TextInput
              style={[styles.modalInput, { backgroundColor: theme.inputBackground, color: theme.text }]}
              value={resetPasswordInput}
              onChangeText={setResetPasswordInput}
              placeholder="Enter password"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
            />

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalCancelButton, { backgroundColor: theme.surface }]}
                onPress={() => {
                  setIsResetModalVisible(false);
                  setResetPasswordInput('');
                }}
                disabled={isResetting}
              >
                <Text style={[styles.modalCancelText, { color: theme.text }]}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalConfirmButton, { backgroundColor: '#D32F2F' }]}
                onPress={handleConfirmResetProgress}
                disabled={isResetting}
              >
                {isResetting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>Confirm</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
    fontSize: 32,
    color: '#000000',
  },
  saveButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  saveButtonCircle: {
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
  saveText: {
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: 16,
    color: '#000000',
  },
  content: {
    padding: SPACING.screenX,
    paddingTop: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.input,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontFamily: 'Inter',
    fontSize: 16,
    color: COLORS.navy,
  },
  inputDisabled: {
    backgroundColor: 'rgba(0,0,0,0.04)',
    color: COLORS.textMuted,
  },
  guestNotice: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.heavyText,
    marginTop: 10,
    textAlign: 'center',
  },
  changePasswordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.input,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  changePasswordText: {
    flex: 1,
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 16,
    color: COLORS.navy,
    marginLeft: 12,
  },
  chevronIcon: {
    opacity: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.card,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  modalTitle: {
    fontFamily: 'Cubao',
    fontSize: 24,
    color: COLORS.navy,
    marginBottom: 12,
    textAlign: 'center',
  },
  modalDescription: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  modalInput: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.input,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: 'Inter',
    fontSize: 16,
    color: COLORS.navy,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 24,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: RADIUS.input,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalCancelText: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 16,
    color: COLORS.textMuted,
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: RADIUS.input,
    backgroundColor: '#D32F2F',
    alignItems: 'center',
  },
  modalConfirmText: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 16,
    color: '#FFFFFF',
  },
});