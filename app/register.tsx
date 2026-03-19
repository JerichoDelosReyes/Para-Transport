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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MinimalistJeep from '../assets/illustrations/minimalistic-jeep.svg';
import { COLORS, RADIUS, SPACING } from '../constants/theme';

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
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.primary} />

      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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

          <SafeAreaView edges={['top']} style={styles.headerSafeContent}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.8}>
              <Ionicons name="chevron-back" size={20} color={COLORS.navy} />
            </TouchableOpacity>

            <View style={styles.headerCenter}>
              <MinimalistJeep width={104} height={64} />
              <Text style={styles.title}>REGISTER</Text>
              <Text style={styles.headerCopy}>Sama ka sa Para community.</Text>
            </View>
          </SafeAreaView>
        </View>

        <View style={styles.formArea}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.formWrap}>
              <Text style={styles.label}>Name</Text>
              <TextInput style={styles.input} placeholder="Juan Dela Cruz" placeholderTextColor={COLORS.textMuted} />

              <Text style={[styles.label, styles.labelTop]}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="juan@para.ph"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
              />

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
    paddingBottom: 24,
  },
  formWrap: {
    paddingHorizontal: SPACING.screenX,
    paddingTop: 18,
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
  input: {
    height: 52,
    borderRadius: RADIUS.input,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    backgroundColor: COLORS.card,
    paddingHorizontal: 14,
    fontFamily: 'Inter',
    fontSize: 17,
    color: COLORS.textStrong,
  },
  passwordWrap: {
    height: 52,
    borderRadius: RADIUS.input,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    backgroundColor: COLORS.card,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 17,
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
    fontSize: 15,
    textDecorationLine: 'underline',
  },
});
