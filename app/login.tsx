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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
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

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

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

            <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/(tabs)')} activeOpacity={0.9}>
              <Text style={styles.primaryButtonText}>LOG IN</Text>
            </TouchableOpacity>

            <View style={styles.socialRow}>
              <TouchableOpacity style={styles.lightSocial} activeOpacity={0.9}>
                <FontAwesome5 name="google" size={15} color="#4285F4" style={{ marginRight: 7 }} />
                <Text style={styles.lightSocialText}>Google</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.appleSocial} activeOpacity={0.9}>
                <Ionicons name="logo-apple" size={16} color="#FFFFFF" style={{ marginRight: 5 }} />
                <Text style={styles.appleSocialText}>Apple</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.linkWrap} onPress={() => router.push('/register')} activeOpacity={0.8}>
              <Text style={styles.linkText}>Create account</Text>
            </TouchableOpacity>

            <Text style={styles.footerText}>Privacy Policy. Terms of Service</Text>
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
    marginTop: 16,
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
  socialRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  appleSocial: {
    flex: 1,
    height: 52,
    borderRadius: RADIUS.pill,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  appleSocialText: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  lightSocial: {
    flex: 1,
    height: 52,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
    borderColor: '#EFEFEF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  lightSocialText: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '600',
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
