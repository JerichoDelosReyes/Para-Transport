import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import { useTheme } from '../src/theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  visible: boolean;
  email: string;
  otp: string;
  isLoading: boolean;
  errorMsg: string;
  onOtpChange: (text: string) => void;
  onVerify: () => void;
  onClose: () => void;
};

export default function OtpModal({ visible, email, otp, isLoading, errorMsg, onOtpChange, onVerify, onClose }: Props) {
  const { theme, isDark } = useTheme();
  const styles = createStyles(theme, isDark);
  
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
          
          <Text style={styles.title}>VERIFY OTP</Text>
          <Text style={styles.subtitle}>Check your email ({email}) for the code.</Text>
          
          <Text style={styles.label}>Verification Code</Text>
          <TextInput 
            value={otp}
            onChangeText={(text) => onOtpChange(text.replace(/[^0-9]/g, ''))}
            style={styles.input} 
            placeholder="123456" 
            placeholderTextColor={theme.textSecondary}
            keyboardType="number-pad" 
            maxLength={6}
          />
          
          {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
          
          <TouchableOpacity 
            style={[styles.primaryButton, isLoading && { opacity: 0.7 }]} 
            onPress={onVerify} 
            disabled={isLoading}
          >
            {isLoading ? <ActivityIndicator color="#0A1628" /> : <Text style={styles.primaryButtonText}>Verify & Continue</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: any, isDark: boolean) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: SPACING.screenX,
  },
  sheet: {
    backgroundColor: theme.surface,
    borderRadius: RADIUS.card,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 8,
  },
  closeBtn: {
    alignSelf: 'flex-end',
    padding: 4,
  },
  title: {
    fontFamily: 'Cubao',
    fontSize: 28,
    color: theme.text,
    textAlign: 'center',
    marginTop: -8,
  },
  subtitle: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 24,
  },
  label: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: theme.textSecondary,
    marginBottom: 8,
  },
  input: {
    height: 52,
    borderRadius: RADIUS.input,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#EFEFEF',
    backgroundColor: theme.inputBackground || theme.background,
    paddingHorizontal: 14,
    fontFamily: 'Inter',
    fontSize: 18,
    color: theme.text,
    textAlign: 'center',
    letterSpacing: 8,
  },
  error: {
    fontFamily: 'Inter',
    color: '#ff4d4d',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  primaryButton: {
    marginTop: 24,
    height: 52,
    borderRadius: RADIUS.pill,
    backgroundColor: isDark ? '#E8A020' : COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.navy,
  },
});