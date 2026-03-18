import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MinimalistJeep from '../assets/illustrations/minimalistic-jeep.svg';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';

export default function RegisterScreen() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={{ backgroundColor: COLORS.background }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.headerZone}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.8}>
              <Ionicons name="chevron-back" size={20} color={COLORS.navy} />
            </TouchableOpacity>
            <MinimalistJeep width={100} height={64} />
            <Text style={styles.title}>REGISTER</Text>
            <Text style={styles.headerCopy}>Sama ka sa Para community.</Text>
          </View>

          <View style={styles.formWrap}>
            <Text style={styles.label}>Name</Text>
            <TextInput style={styles.input} placeholder="Juan Dela Cruz" placeholderTextColor={COLORS.textMuted} />

            <Text style={[styles.label, styles.labelTop]}>Email</Text>
            <TextInput style={styles.input} placeholder="juan@para.ph" placeholderTextColor={COLORS.textMuted} autoCapitalize="none" />

            <Text style={[styles.label, styles.labelTop]}>Password</Text>
            <View style={styles.passwordWrap}>
              <TextInput style={styles.passwordInput} placeholder="**********" placeholderTextColor={COLORS.textMuted} secureTextEntry={!showPassword} />
              <TouchableOpacity onPress={() => setShowPassword((prev) => !prev)}>
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color={COLORS.navy} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.label, styles.labelTop]}>Confirm Password</Text>
            <View style={styles.passwordWrap}>
              <TextInput style={styles.passwordInput} placeholder="**********" placeholderTextColor={COLORS.textMuted} secureTextEntry={!showConfirm} />
              <TouchableOpacity onPress={() => setShowConfirm((prev) => !prev)}>
                <Ionicons name={showConfirm ? 'eye-off' : 'eye'} size={20} color={COLORS.navy} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/(tabs)')} activeOpacity={0.9}>
              <Text style={styles.primaryButtonText}>Create Account</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.linkWrap} onPress={() => router.push('/login')}>
              <Text style={styles.linkText}>Already have an account? Log in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  headerZone: {
    backgroundColor: COLORS.primary,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingHorizontal: SPACING.screenX,
    paddingTop: 10,
    paddingBottom: 18,
    alignItems: 'center',
  },
  backButton: {
    alignSelf: 'flex-start',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  title: {
    marginTop: 6,
    fontFamily: 'Cubao',
    color: COLORS.navy,
    fontSize: TYPOGRAPHY.screenTitle,
  },
  headerCopy: {
    marginTop: 4,
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.label,
    color: COLORS.navy,
    opacity: 0.85,
  },
  formWrap: {
    paddingHorizontal: SPACING.screenX,
    paddingTop: 22,
  },
  label: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.label,
    color: COLORS.textLabel,
  },
  labelTop: {
    marginTop: 12,
  },
  input: {
    height: 52,
    borderRadius: RADIUS.input,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    marginTop: 8,
    backgroundColor: COLORS.card,
    paddingHorizontal: 14,
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.body,
    color: COLORS.textStrong,
  },
  passwordWrap: {
    height: 52,
    borderRadius: RADIUS.input,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    marginTop: 8,
    backgroundColor: COLORS.card,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.body,
    color: COLORS.textStrong,
  },
  primaryButton: {
    marginTop: 18,
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
  primaryButtonText: {
    fontFamily: 'Inter',
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.navy,
  },
  linkWrap: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkText: {
    fontFamily: 'Inter',
    color: COLORS.navy,
    fontSize: TYPOGRAPHY.label,
    textDecorationLine: 'underline',
  },
});
