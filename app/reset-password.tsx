import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../config/supabaseClient';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import { mapResetPasswordError, passwordValidationMessage, updatePassword } from '../services/authService';

type RecoveryTokens = {
  accessToken: string;
  refreshToken: string;
  type: string;
};

function parseRecoveryTokens(url: string): RecoveryTokens | null {
  const hashPart = url.split('#')[1] || '';
  const queryPart = url.includes('?') ? url.split('?')[1].split('#')[0] : '';

  const hashParams = new URLSearchParams(hashPart);
  const queryParams = new URLSearchParams(queryPart);

  const accessToken = hashParams.get('access_token') || queryParams.get('access_token') || '';
  const refreshToken = hashParams.get('refresh_token') || queryParams.get('refresh_token') || '';
  const type = hashParams.get('type') || queryParams.get('type') || '';

  if (!accessToken || !refreshToken || type !== 'recovery') {
    return null;
  }

  return { accessToken, refreshToken, type };
}

export default function ResetPasswordScreen() {
  const router = useRouter();

  const [isPreparingSession, setIsPreparingSession] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [prepareError, setPrepareError] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const passwordRuleError = useMemo(() => passwordValidationMessage(newPassword), [newPassword]);

  useEffect(() => {
    let mounted = true;

    const prepareSession = async () => {
      setIsPreparingSession(true);
      setPrepareError('');

      try {
        const initialUrl = await Linking.getInitialURL();
        if (!initialUrl) {
          throw new Error('Missing reset link context.');
        }

        const tokens = parseRecoveryTokens(initialUrl);
        if (!tokens) {
          throw new Error('Invalid or expired reset link. Please request a new one.');
        }

        const { error } = await supabase.auth.setSession({
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
        });

        if (error) {
          throw error;
        }

        if (mounted) {
          setSessionReady(true);
        }
      } catch (error: any) {
        if (mounted) {
          setPrepareError(mapResetPasswordError(error?.message || error?.code));
        }
      } finally {
        if (mounted) {
          setIsPreparingSession(false);
        }
      }
    };

    void prepareSession();

    return () => {
      mounted = false;
    };
  }, []);

  const handleChangePassword = async () => {
    setSubmitError('');

    if (passwordRuleError) {
      setSubmitError(passwordRuleError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setSubmitError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await updatePassword(newPassword);
      Alert.alert('Password Updated', 'Your password has been changed. You can now log in.', [
        {
          text: 'OK',
          onPress: () => router.replace('/login'),
        },
      ]);
    } catch (error: any) {
      setSubmitError(mapResetPasswordError(error?.message || error?.code));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.headerZone}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/login')} activeOpacity={0.8}>
            <Ionicons name="chevron-back" size={20} color={COLORS.navy} />
          </TouchableOpacity>
          <Text style={styles.title}>RESET PASSWORD</Text>
          <Text style={styles.headerCopy}>Set your new account password.</Text>
        </View>

        <View style={styles.formArea}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {isPreparingSession ? (
              <View style={styles.centerBlock}>
                <ActivityIndicator color={COLORS.navy} />
                <Text style={styles.centerText}>Preparing secure reset session...</Text>
              </View>
            ) : null}

            {!isPreparingSession && prepareError ? (
              <View style={styles.centerBlock}>
                <Text style={styles.errorText}>{prepareError}</Text>
                <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/login')}>
                  <Text style={styles.primaryButtonText}>BACK TO LOGIN</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {!isPreparingSession && sessionReady ? (
              <>
                <Text style={styles.label}>New Password</Text>
                <View style={styles.passwordWrap}>
                  <TextInput
                    value={newPassword}
                    onChangeText={setNewPassword}
                    style={styles.passwordInput}
                    placeholder="Enter new password"
                    placeholderTextColor={COLORS.textMuted}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity onPress={() => setShowPassword((prev) => !prev)}>
                    <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color={COLORS.navy} />
                  </TouchableOpacity>
                </View>

                <Text style={[styles.label, styles.labelTop]}>Confirm Password</Text>
                <View style={styles.passwordWrap}>
                  <TextInput
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    style={styles.passwordInput}
                    placeholder="Confirm new password"
                    placeholderTextColor={COLORS.textMuted}
                    secureTextEntry={!showConfirmPassword}
                  />
                  <TouchableOpacity onPress={() => setShowConfirmPassword((prev) => !prev)}>
                    <Ionicons name={showConfirmPassword ? 'eye-off' : 'eye'} size={20} color={COLORS.navy} />
                  </TouchableOpacity>
                </View>

                {passwordRuleError ? <Text style={styles.errorText}>{passwordRuleError}</Text> : null}
                {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

                <TouchableOpacity
                  style={[styles.primaryButton, isSubmitting && styles.disabledButton]}
                  onPress={handleChangePassword}
                  activeOpacity={0.9}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? <ActivityIndicator color={COLORS.navy} /> : <Text style={styles.primaryButtonText}>UPDATE PASSWORD</Text>}
                </TouchableOpacity>
              </>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  headerZone: {
    backgroundColor: COLORS.primary,
    minHeight: 220,
    borderBottomLeftRadius: 34,
    borderBottomRightRadius: 34,
    paddingHorizontal: SPACING.screenX,
    paddingTop: 54,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 12,
    fontFamily: 'Cubao',
    color: COLORS.navy,
    fontSize: 34,
  },
  headerCopy: {
    marginTop: 4,
    fontFamily: 'Inter',
    fontSize: 15,
    color: COLORS.navy,
    opacity: 0.86,
  },
  formArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingHorizontal: SPACING.screenX,
    paddingTop: 18,
    paddingBottom: 36,
  },
  centerBlock: {
    marginTop: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  centerText: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.textStrong,
  },
  label: {
    fontFamily: 'Inter',
    fontSize: 15,
    color: COLORS.textLabel,
    marginBottom: 8,
  },
  labelTop: {
    marginTop: 12,
  },
  passwordWrap: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 17,
    color: COLORS.navy,
  },
  errorText: {
    fontFamily: 'Inter',
    color: '#ff4d4d',
    fontSize: 13,
    marginTop: 8,
  },
  primaryButton: {
    marginTop: 24,
    height: 56,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 6,
  },
  disabledButton: {
    opacity: 0.7,
  },
  primaryButtonText: {
    fontFamily: 'Inter',
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.navy,
  },
});
