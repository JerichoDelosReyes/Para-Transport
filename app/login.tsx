import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import MinimalistJeep from '../assets/illustrations/minimalistic-jeep.svg';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import { supabase } from '../config/supabaseClient';
import {
  loginWithEmailPassword,
  verifyEmailOtp,
  isEmailValid,
  mapLoginError,
  mapResetPasswordError,
  sendPasswordResetEmail,
  logUserAction
} from '../services/authService';
import { useStore } from '../store/useStore';
import OtpModal from '../components/OtpModal';

type HeaderDoodle = {
  id: number;
  icon: keyof typeof Ionicons.glyphMap;
  top: `${number}%`;
  left: `${number}%`;
  size: number;
  rotate: string;
};

const HEADER_DOODLES: HeaderDoodle[] = [
  { id: 1, icon: 'navigate-outline', top: '18%', left: '10%', size: 18, rotate: '-18deg' },
  { id: 2, icon: 'cash-outline', top: '16%', left: '82%', size: 18, rotate: '20deg' },
  { id: 3, icon: 'trail-sign-outline', top: '44%', left: '14%', size: 17, rotate: '-24deg' },
  { id: 4, icon: 'swap-horizontal-outline', top: '36%', left: '76%', size: 18, rotate: '16deg' },
  { id: 5, icon: 'star-outline', top: '62%', left: '83%', size: 16, rotate: '-8deg' },
  { id: 6, icon: 'car-outline', top: '58%', left: '9%', size: 18, rotate: '25deg' },
];

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const beginAuthSession = useStore((state) => state.beginAuthSession);
  
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isForgotModalVisible, setIsForgotModalVisible] = useState(false);
  const [resetEmailInput, setResetEmailInput] = useState('');
  const [forgotErrorMsg, setForgotErrorMsg] = useState('');
  const [isForgotSubmitting, setIsForgotSubmitting] = useState(false);
  
  const [isOtpPending, setIsOtpPending] = useState(false);
  const [otp, setOtp] = useState('');

  const handleLogin = async () => {
    setErrorMsg('');
    if (!email.trim() || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }
    if (!isEmailValid(email)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    try {
      const data = await loginWithEmailPassword(email, password);
      
      let userStats: any = {};
      try {
        const { data: profile } = await supabase
          .from('users')
          .select('points, streak_count, distance, trips, spent, badges, saved_routes, saved_places')
          .eq('email', email.trim().toLowerCase())
          .single();
        if (profile) userStats = profile;
      } catch (err) {}

      // Construct a unified user to save in store
      if (data?.user?.id) await logUserAction(data.user.id, 'Logged in');
      beginAuthSession({
        id: data?.user?.id,
        full_name: data?.user?.user_metadata?.display_name || 'Commuter',
        email: data?.user?.email || email,
        points: userStats.points || 0,
        streak_count: userStats.streak_count || 0,
        total_distance: userStats.total_distance || 0,
        total_trips: userStats.total_trips || 0,
        spent: userStats.spent || 0,
        saved_routes: userStats.saved_routes || [],
        saved_places: userStats.saved_places || [],
        badges: userStats.badges || []
      });
      router.replace('/(tabs)');
    } catch (err: any) {
      if (err.message && err.message.toLowerCase().includes('email not confirmed')) {
         setIsOtpPending(true);
         setErrorMsg('');
      } else {
         setErrorMsg(mapLoginError(err.code || err.message));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const openForgotPasswordPopup = () => {
    setForgotErrorMsg('');
    setResetEmailInput(email.trim());
    setIsForgotModalVisible(true);
  };

  const handleForgotPasswordSubmit = async () => {
    setForgotErrorMsg('');
    const normalizedEmail = resetEmailInput.trim();
    if (!isEmailValid(normalizedEmail)) {
      setForgotErrorMsg('Please enter a valid email address.');
      return;
    }

    setIsForgotSubmitting(true);
    try {
      await sendPasswordResetEmail(normalizedEmail);
      setIsForgotModalVisible(false);
      setResetEmailInput(normalizedEmail);
      Alert.alert('Reset Email Sent', 'If this email is registered, a password reset link has been sent.');
    } catch (err: any) {
      setForgotErrorMsg(mapResetPasswordError(err?.code || err?.message));
    } finally {
      setIsForgotSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    setErrorMsg('');
    if (!otp.trim()) {
      setErrorMsg('Please enter the verification code.');
      return;
    }
    
    setIsLoading(true);
    try {
      const data = await verifyEmailOtp(email, otp);
      
      let userStats: any = {};
      try {
        const { data: profile } = await supabase
          .from('users')
          .select('points, streak_count, distance, trips, spent, badges, saved_routes, saved_places')
          .eq('email', email.trim().toLowerCase())
          .single();
        if (profile) userStats = profile;
      } catch (err) {}
      
      beginAuthSession({
        id: data?.user?.id,
        full_name: data?.user?.user_metadata?.display_name || 'Commuter',
        email: data?.user?.email || email,
        points: userStats.points || 0,
        streak_count: userStats.streak_count || 0,
        total_distance: userStats.total_distance || 0,
        total_trips: userStats.total_trips || 0,
        spent: userStats.spent || 0,
        saved_routes: userStats.saved_routes || [],
        saved_places: userStats.saved_places || [],
        badges: userStats.badges || []
      });
      setIsOtpPending(false);
      router.replace('/(tabs)');
    } catch (err: any) {
      const msg = (err.message || '').includes('expired or is invalid') ? 'Invalid OTP' : err.message;
      setErrorMsg(msg || 'Verification failed. Please check the code.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />

      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.headerZone}>
          {HEADER_DOODLES.map((doodle) => (
            <View
              key={doodle.id}
              style={[
                styles.headerDoodle,
                {
                  top: doodle.top,
                  left: doodle.left,
                  transform: [{ rotate: doodle.rotate }],
                },
              ]}
            >
              <Ionicons name={doodle.icon} size={doodle.size} color="rgba(0,0,0,0.08)" />
            </View>
          ))}

          <View style={[styles.headerSafeContent, { paddingTop: insets.top }]}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.8}>
              <Ionicons name="chevron-back" size={20} color={COLORS.navy} />
            </TouchableOpacity>

            <View style={styles.headerCenter}>
              <MinimalistJeep width={104} height={64} />
              <Text style={styles.title}>LOG IN</Text>
              <Text style={styles.headerCopy}>Tuloy na, tara na sa byahe.</Text>
            </View>
          </View>
        </View>

        <View style={styles.formArea}>
          <ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom + 20, 40) }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              placeholder="someone@gmail.com"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={[styles.label, styles.labelTop]}>Password</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                style={styles.passwordInput}
                placeholder="**********"
                placeholderTextColor={COLORS.textMuted}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword((prev) => !prev)}>
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color={COLORS.navy} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.forgotPasswordWrap}
              onPress={openForgotPasswordPopup}
              activeOpacity={0.8}
              disabled={isLoading}
            >
              <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
            </TouchableOpacity>

            {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

            <TouchableOpacity 
              style={[styles.primaryButton, isLoading && styles.disabledButton]} 
              onPress={handleLogin} 
              activeOpacity={0.9}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>LOG IN</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.linkWrap} onPress={() => router.navigate('/register')} activeOpacity={0.8}>
              <Text style={styles.linkText}>Create account</Text>
            </TouchableOpacity>

            <Text style={styles.footerText}>Privacy Policy. Terms of Service</Text>
          </ScrollView>
        </View>

        {isOtpPending && (
          <OtpModal 
            visible={isOtpPending}
            email={email}
            otp={otp}
            isLoading={isLoading}
            errorMsg={errorMsg}
            onOtpChange={setOtp}
            onVerify={handleVerifyOtp}
            onClose={() => setIsOtpPending(false)}
          />
        )}

        <Modal
          visible={isForgotModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setIsForgotModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Forgot Password</Text>
              <Text style={styles.modalBody}>Enter your email and we will send a reset link.</Text>

              <TextInput
                value={resetEmailInput}
                onChangeText={setResetEmailInput}
                style={styles.modalInput}
                placeholder="someone@gmail.com"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              {forgotErrorMsg ? <Text style={styles.modalErrorText}>{forgotErrorMsg}</Text> : null}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalSecondaryButton}
                  onPress={() => setIsForgotModalVisible(false)}
                  activeOpacity={0.8}
                  disabled={isForgotSubmitting}
                >
                  <Text style={styles.modalSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalPrimaryButton, isForgotSubmitting && styles.disabledButton]}
                  onPress={handleForgotPasswordSubmit}
                  activeOpacity={0.8}
                  disabled={isForgotSubmitting}
                >
                  <Text style={styles.modalPrimaryText}>{isForgotSubmitting ? 'Sending...' : 'Send Email'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
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
    minHeight: 290,
    borderBottomLeftRadius: 34,
    borderBottomRightRadius: 34,
    overflow: 'hidden',
  },
  headerDoodle: {
    position: 'absolute',
  },
  headerSafeContent: {
    flex: 1,
    paddingHorizontal: SPACING.screenX,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 18,
  },
  title: {
    marginTop: 6,
    fontFamily: 'Cubao',
    color: COLORS.navy,
    fontSize: 34,
  },
  headerCopy: {
    marginTop: 3,
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
    paddingBottom: 24,
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
  errorText: {
    fontFamily: 'Inter',
    color: '#ff4d4d',
    fontSize: 13,
    marginTop: 8,
    marginBottom: -8,
  },
  forgotPasswordWrap: {
    marginTop: 10,
    alignSelf: 'flex-end',
  },
  forgotPasswordText: {
    fontFamily: 'Inter',
    fontSize: 13,
    color: COLORS.navy,
    textDecorationLine: 'underline',
    opacity: 0.9,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10,22,40,0.35)',
    justifyContent: 'center',
    paddingHorizontal: SPACING.screenX,
  },
  modalCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.card,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  modalTitle: {
    fontFamily: 'Cubao',
    fontSize: 24,
    color: COLORS.navy,
  },
  modalBody: {
    marginTop: 6,
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.textStrong,
    opacity: 0.8,
  },
  modalInput: {
    marginTop: 12,
    height: 48,
    borderRadius: RADIUS.input,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    fontFamily: 'Inter',
    fontSize: 16,
    color: COLORS.navy,
  },
  modalErrorText: {
    marginTop: 8,
    fontFamily: 'Inter',
    fontSize: 13,
    color: '#ff4d4d',
  },
  modalActions: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalSecondaryButton: {
    height: 40,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
  },
  modalSecondaryText: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.navy,
    fontWeight: '600',
  },
  modalPrimaryButton: {
    height: 40,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
  },
  modalPrimaryText: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.navy,
    fontWeight: '700',
  },
  input: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    fontFamily: 'Inter',
    fontSize: 17,
    color: COLORS.navy,
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
  linkWrap: {
    marginTop: 14,
    alignItems: 'center',
  },
  linkText: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.navy,
    textDecorationLine: 'underline',
  },
  footerText: {
    marginTop: 10,
    textAlign: 'center',
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textMuted,
  },
});
