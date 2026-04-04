import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MinimalistJeep from '../assets/illustrations/minimalistic-jeep.svg';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import { supabase } from '../config/supabaseClient';
import OtpModal from '../components/OtpModal';
import {
  registerWithEmailPassword,
  checkUsernameExists,
  verifyEmailOtp,
  isEmailValid,
  isPasswordStrong,
  passwordValidationMessage,
  validateUsername,
  mapRegisterError,
  logUserAction
} from '../services/authService';
import { useTheme } from '../src/theme/ThemeContext';
import { useStore } from '../store/useStore';

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

export default function RegisterScreen() {
  const { theme, isDark } = useTheme();
  const styles = createStyles(theme, isDark);
  const router = useRouter();
  const beginAuthSession = useStore((state) => state.beginAuthSession);

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [otp, setOtp] = useState('');

  const handleRegister = async () => {
    setErrorMsg('');
    if (!name.trim() || !username.trim() || !email.trim() || !password || !confirmPassword) {
      setErrorMsg('Please fill in all fields.');
      return;
    }
    
    const userErr = validateUsername(username);
    if (userErr) {
      setErrorMsg(userErr);
      return;
    }

    if (!isEmailValid(email)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    const pwdErr = passwordValidationMessage(password);
    if (pwdErr) {
      setErrorMsg(pwdErr);
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const usernameTaken = await checkUsernameExists(username);
      if (usernameTaken) {
        setErrorMsg('Username is already taken.');
        setIsLoading(false);
        return;
      }

      const data = await registerWithEmailPassword({
        username,
        displayName: username,
        fullName: name,
        email,
        password,
      });

      // If email confirmation is required, session will be null
      if (data?.user && !data.session) {
        setIsOtpSent(true);
      } else {
        if (data?.user?.id) {
          try {
            await logUserAction(data.user.id, 'Registered new account');
            await supabase.from('users').update({ 
              username: username,
              display_name: username,
              full_name: name
            }).eq('id', data.user.id);
          } catch (e) {
            console.warn('Could not auto-sync username to public.users', e);
          }
        }
        beginAuthSession({
          id: data?.user?.id,
          username: data?.user?.user_metadata?.username || username,
          full_name: data?.user?.user_metadata?.full_name || name,
          email: data?.user?.email || email,
          points: 0,
          streak_count: 0,
          total_distance: 0,
        total_trips: 0,
          spent: 0,
          saved_routes: [],
          saved_places: [],
          badges: []
        });
        router.replace('/(tabs)');
      }
    } catch (err: any) {
      setErrorMsg(mapRegisterError(err.code || err.message));
    } finally {
      setIsLoading(false);
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
      
      if (data?.user?.id) {
        await logUserAction(data.user.id, 'Registered new account');
        
        // Self-healing: make sure public.users has the username and display_name
        try {
          await supabase.from('users').update({ 
            username: username,
            display_name: username,
            full_name: name
          }).eq('id', data.user.id);
        } catch (e) {
          console.warn('Could not auto-sync username to public.users', e);
        }
      }

      beginAuthSession({
        id: data?.user?.id,
        username: data?.user?.user_metadata?.username || username,
        full_name: data?.user?.user_metadata?.full_name || name,
        email: data?.user?.email || email,
        points: 0,
        streak_count: 0,
        total_distance: 0,
        total_trips: 0,
        spent: 0,
        saved_routes: [],
        saved_places: [],
        badges: []
      });
      router.replace('/(tabs)');
    } catch (err: any) {
      const msg = (err.message || '').includes('expired or is invalid') ? 'Invalid OTP' : err.message;
      setErrorMsg(msg || 'Verification failed. Please check the code.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#E8A020" />

      <KeyboardAvoidingView style={[styles.screen, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.headerZone, { backgroundColor: isDark ? '#E8A020' : COLORS.primary }]}>
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

          <SafeAreaView edges={['top']} style={styles.headerSafeContent}>
            <TouchableOpacity style={[styles.backButton, { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]} onPress={() => router.back()} activeOpacity={0.8}>
              <Ionicons name="chevron-back" size={20} color="#0A1628" />
            </TouchableOpacity>

            <View style={styles.headerCenter}>
              <MinimalistJeep width={104} height={64} />
              <Text style={[styles.title, { color: '#0A1628' }]}>REGISTER</Text>
              <Text style={[styles.headerCopy, { color: '#0A1628' }]}>Sama ka sa Para community.</Text>
            </View>
          </SafeAreaView>
        </View>

        <View style={[styles.formArea, { backgroundColor: theme.background }]}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.formWrap}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Name</Text>
              <TextInput 
                value={name}
                onChangeText={setName}
                style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.text }]} 
                placeholder="Juan Dela Cruz" 
                placeholderTextColor={theme.textSecondary} 
              />

              <Text style={[styles.label, styles.labelTop, { color: theme.textSecondary }]}>Username</Text>
              <TextInput 
                value={username}
                onChangeText={(text) => setUsername(text.replace(/\s/g, ''))}
                style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.text }]} 
                placeholder="juancruz123" 
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
              />

              <Text style={[styles.label, styles.labelTop, { color: theme.textSecondary }]}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.text }]}
                placeholder="juan@para.ph"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <Text style={[styles.label, styles.labelTop, { color: theme.textSecondary }]}>Password</Text>
              <View style={[styles.passwordWrap, { backgroundColor: theme.inputBackground }]}>
                <TextInput 
                  value={password}
                  onChangeText={setPassword}
                  style={[styles.passwordInput, { color: theme.text }]} 
                  placeholder="**********" 
                  placeholderTextColor={theme.textSecondary} 
                  secureTextEntry={!showPassword} 
                />
                <TouchableOpacity onPress={() => setShowPassword((prev) => !prev)}>
                  <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.label, styles.labelTop, { color: theme.textSecondary }]}>Confirm Password</Text>
              <View style={[styles.passwordWrap, { backgroundColor: theme.inputBackground }]}>
                <TextInput 
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  style={[styles.passwordInput, { color: theme.text }]} 
                  placeholder="**********" 
                  placeholderTextColor={theme.textSecondary} 
                  secureTextEntry={!showConfirm} 
                />
                <TouchableOpacity onPress={() => setShowConfirm((prev) => !prev)}>
                  <Ionicons name={showConfirm ? 'eye-off' : 'eye'} size={20} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>

              {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

              <TouchableOpacity 
                style={[styles.primaryButton, isLoading && styles.disabledButton]} 
                onPress={handleRegister} 
                activeOpacity={0.9}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#0A1628" />
                ) : (
                  <Text style={styles.primaryButtonText}>Create Account</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.linkWrap} onPress={() => router.navigate('/login')}>
                <Text style={styles.linkText}>Already have an account? Log in</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {isOtpSent && (
            <OtpModal 
              visible={isOtpSent}
              email={email}
              otp={otp}
              isLoading={isLoading}
              errorMsg={errorMsg}
              onOtpChange={setOtp}
              onVerify={handleVerifyOtp}
              onClose={() => setIsOtpSent(false)}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const createStyles = (theme: any, isDark: boolean) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: isDark ? '#E8A020' : COLORS.primary,
  },
  headerZone: {
    backgroundColor: isDark ? '#E8A020' : COLORS.primary,
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
    color: theme.text,
    fontSize: 34,
  },
  headerCopy: {
    marginTop: 3,
    fontFamily: 'Inter',
    fontSize: 15,
    color: theme.text,
    opacity: 0.86,
  },
  formArea: {
    flex: 1,
    backgroundColor: theme.background,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  formWrap: {
    paddingHorizontal: SPACING.screenX,
    paddingTop: 18,
  },
  label: {
    fontFamily: 'Inter',
    fontSize: 15,
    color: theme.textSecondary,
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
  input: {
    height: 52,
    borderRadius: RADIUS.input,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#EFEFEF',
    backgroundColor: theme.cardBackground,
    paddingHorizontal: 14,
    fontFamily: 'Inter',
    fontSize: 17,
    color: theme.text,
  },
  passwordWrap: {
    height: 52,
    borderRadius: RADIUS.input,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#EFEFEF',
    backgroundColor: theme.cardBackground,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 17,
    color: theme.text,
  },
  primaryButton: {
    marginTop: 24,
    height: 56,
    borderRadius: RADIUS.pill,
    backgroundColor: isDark ? '#E8A020' : COLORS.primary,
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
    color: '#0A1628',
  },
  linkWrap: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkText: {
    fontFamily: 'Inter',
    color: theme.text,
    fontSize: 15,
    textDecorationLine: 'underline',
  },
});
