/**
 * CompleteDetailsScreen
 * 
 * Screen for completing user profile details after Google Sign-In.
 * Includes username, email (pre-filled from Google), first name, last name, and phone number.
 * Users can proceed to additional details or skip.
 * 
 * @module screens/auth/CompleteDetailsScreen
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
  ScrollView,
  StyleSheet,
  Linking,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Import UI components from gluestack-ui
import { Text } from '../../../components/ui/text';
import { Input, InputField, InputSlot } from '../../../components/ui/input';
import { Button, ButtonText, ButtonSpinner } from '../../../components/ui/button';
import { Tooltip, TooltipContent, TooltipText } from '../../../components/ui/tooltip';

// Lucide icons
import { ChevronLeft, Eye, EyeOff } from 'lucide-react-native';

// Auth context
import { useAuth } from '../../context/AuthContext';

// Global constants
import { LEGAL_URLS, VALIDATION } from '../../config/constants';

// Philippine Flag component - inline SVG-like View for React Native
const PhilippineFlag: React.FC<{ width?: number; height?: number }> = ({ 
  width = 24, 
  height = 16 
}) => {
  return (
    <View style={{ width, height, overflow: 'hidden', borderRadius: 2 }}>
      {/* Blue stripe (top) */}
      <View style={{ 
        position: 'absolute', 
        top: 0, 
        left: 0, 
        right: 0, 
        height: height / 2, 
        backgroundColor: '#0038A8' 
      }} />
      {/* Red stripe (bottom) */}
      <View style={{ 
        position: 'absolute', 
        bottom: 0, 
        left: 0, 
        right: 0, 
        height: height / 2, 
        backgroundColor: '#CE1126' 
      }} />
      {/* White triangle */}
      <View style={{ 
        position: 'absolute',
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        borderLeftWidth: 0,
        borderRightWidth: width * 0.5,
        borderTopWidth: height / 2,
        borderBottomWidth: height / 2,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: 'white',
        borderBottomColor: 'white',
        backgroundColor: '#D9D9D9',
      }} />
     
    </View>
  );
};

/**
 * Brand color tokens (matching gluestack-ui.config.ts and Figma design)
 */
const COLORS = {
  white: '#FFFFFF',
  paraBrand: '#E9AE16', // Base/Main Theme from Figma
  textDark900: '#171815', // Text color from Figma
  textDark500: '#121310',
  borderLight300: '#868685', // Border color from Figma
  buttonTextDark: '#1E1E1E', // M3/sys/light/on-surface from Figma
  placeholder: '#A09CAB', // Gray/Medium from Figma
  tooltipBg: '#272625', // background/background900 from Figma
  tooltipText: '#F5F5F5', // typography/typography50 from Figma
  shadowColor: '#262626',
} as const;

/**
 * Props for CompleteDetailsScreen
 */
export interface CompleteDetailsScreenProps {
  navigation?: {
    navigate: (screen: string, params?: object) => void;
    goBack: () => void;
  };
  route?: {
    params?: {
      email?: string;
    };
  };
}

/**
 * CompleteDetailsScreen Component
 * 
 * Full screen for completing user profile after Google Sign-In.
 * Implements the Figma design with gluestack-ui components.
 */
export const CompleteDetailsScreen: React.FC<CompleteDetailsScreenProps> = ({ 
  navigation,
  route,
}) => {
  // Auth context
  const { user, createUserProfile, signOut, isLoading: authLoading, error: authError } = useAuth();
  
  // Pre-filled email from Google Sign-In
  const verifiedEmail = user?.email || route?.params?.email || '';

  // Form state
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState(user?.displayName?.split(' ')[0] || '');
  const [lastName, setLastName] = useState(user?.displayName?.split(' ').slice(1).join(' ') || '');
  const [phoneNumber, setPhoneNumber] = useState('');
  
  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  
  // Validation touched states (show errors only after user interaction)
  const [touched, setTouched] = useState({
    username: false,
    firstName: false,
    lastName: false,
    phoneNumber: false,
  });

  // Focus states for inputs
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [firstNameFocused, setFirstNameFocused] = useState(false);
  const [lastNameFocused, setLastNameFocused] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);

  /**
   * Validation: Check if all required fields are filled
   */
  const validationErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    
    if (!username.trim()) {
      errors.username = 'Username is required';
    } else if (username.trim().length < VALIDATION.USERNAME_MIN_LENGTH) {
      errors.username = `Username must be at least ${VALIDATION.USERNAME_MIN_LENGTH} characters`;
    }
    
    if (!firstName.trim()) {
      errors.firstName = 'First name is required';
    }
    
    if (!lastName.trim()) {
      errors.lastName = 'Last name is required';
    }
    
    // Phone number validation (10 digits without formatting)
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (!cleanPhone) {
      errors.phoneNumber = 'Phone number is required';
    } else if (cleanPhone.length !== VALIDATION.PHONE_NUMBER_LENGTH) {
      errors.phoneNumber = `Phone number must be ${VALIDATION.PHONE_NUMBER_LENGTH} digits`;
    }
    
    return errors;
  }, [username, firstName, lastName, phoneNumber]);

  /**
   * Check if form is valid (no errors)
   */
  const isFormValid = useMemo(() => {
    return Object.keys(validationErrors).length === 0;
  }, [validationErrors]);

  /**
   * Handle back navigation - signs out to cancel registration
   * Since there's no navigation history after Google Auth, we sign out instead
   */
  const handleBack = useCallback(async () => {
    try {
      await signOut();
      // User will be redirected to LoginScreen automatically by auth state change
    } catch (err) {
      console.error('Error signing out:', err);
    }
  }, [signOut]);

  /**
   * Open Privacy Policy link
   */
  const handleOpenPrivacyPolicy = useCallback(() => {
    Linking.openURL(LEGAL_URLS.PRIVACY_POLICY).catch((err) => {
      console.error('Failed to open Privacy Policy URL:', err);
    });
  }, []);

  /**
   * Open Terms of Service link
   */
  const handleOpenTermsOfService = useCallback(() => {
    Linking.openURL(LEGAL_URLS.TERMS_OF_SERVICE).catch((err) => {
      console.error('Failed to open Terms of Service URL:', err);
    });
  }, []);

  /**
   * Handle form submission - create user profile
   * Navigation will be handled automatically by auth state change
   */
  const handleSubmit = useCallback(async () => {
    setIsLoading(true);
    
    try {
      await createUserProfile({
        username,
        firstName,
        lastName,
        phoneNumber: phoneNumber.replace(/\s/g, ''), // Remove spaces from phone
        displayName: `${firstName} ${lastName}`.trim(),
      });
      // Navigation will happen automatically when userProfile state updates
      // The App.tsx navigator will switch to Success screen
    } catch (err) {
      console.error('Error creating profile:', err);
    } finally {
      setIsLoading(false);
    }
  }, [createUserProfile, username, firstName, lastName, phoneNumber]);

  /**
   * Handle Additional Details button press
   * Shows tooltip with "Coming Soon, Skip for now" message
   */
  const handleAdditionalDetails = useCallback(() => {
    setShowTooltip(true);
    // Auto-hide tooltip after 3 seconds
    setTimeout(() => {
      setShowTooltip(false);
    }, 3000);
  }, []);

  /**
   * Handle Skip button press
   * Creates profile with current data and proceeds
   */
  const handleSkip = useCallback(async () => {
    await handleSubmit();
  }, [handleSubmit]);

  /**
   * Format phone number input
   * Formats as: XXX XXX XXXX
   */
  const formatPhoneNumber = useCallback((text: string) => {
    // Remove non-numeric characters
    const cleaned = text.replace(/\D/g, '');
    // Limit to 10 digits
    const limited = cleaned.slice(0, 10);
    // Format with spaces
    if (limited.length <= 3) {
      return limited;
    } else if (limited.length <= 6) {
      return `${limited.slice(0, 3)} ${limited.slice(3)}`;
    } else {
      return `${limited.slice(0, 3)} ${limited.slice(3, 6)} ${limited.slice(6)}`;
    }
  }, []);

  /**
   * Handle phone number change
   */
  const handlePhoneChange = useCallback((text: string) => {
    setPhoneNumber(formatPhoneNumber(text));
  }, [formatPhoneNumber]);

  const buttonLoading = isLoading || authLoading;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <View style={styles.content}>
          {/* Back Button */}
          <View style={styles.backButtonContainer}>
            <Pressable 
              onPress={handleBack} 
              style={styles.backButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <ChevronLeft size={24} color={COLORS.textDark900} strokeWidth={2} />
            </Pressable>
          </View>

          {/* Title */}
          <Text style={styles.title}>Complete your details</Text>

          {/* Scrollable Content */}
          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            {/* Input Fields */}
            <View style={styles.inputSection}>
              {/* Username Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Username <Text style={styles.requiredAsterisk}>*</Text></Text>
                <Input
                  variant="outline"
                  size="xl"
                  style={[
                    styles.inputContainer,
                    usernameFocused && styles.inputFocused,
                    touched.username && validationErrors.username && styles.inputError,
                  ]}
                >
                  <InputField
                    placeholder="JDelacruz31"
                    placeholderTextColor={COLORS.placeholder}
                    value={username}
                    onChangeText={setUsername}
                    onFocus={() => setUsernameFocused(true)}
                    onBlur={() => {
                      setUsernameFocused(false);
                      setTouched(prev => ({ ...prev, username: true }));
                    }}
                    autoCapitalize="none"
                    className="text-[#171815]"
                    style={styles.inputField}
                  />
                </Input>
                {touched.username && validationErrors.username && (
                  <Text style={styles.errorText}>{validationErrors.username}</Text>
                )}
              </View>

              {/* Email Input (Pre-filled, Read-only) */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email</Text>
                <Input
                  variant="outline"
                  size="xl"
                  style={styles.inputContainerDisabled}
                  isReadOnly
                >
                  <InputField
                    placeholder="&emailAddress"
                    placeholderTextColor={COLORS.placeholder}
                    value={verifiedEmail}
                    editable={false}
                    style={styles.inputFieldDisabled}
                  />
                </Input>
              </View>

              {/* First Name Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>First Name <Text style={styles.requiredAsterisk}>*</Text></Text>
                <Input
                  variant="outline"
                  size="xl"
                  style={[
                    styles.inputContainer,
                    firstNameFocused && styles.inputFocused,
                    touched.firstName && validationErrors.firstName && styles.inputError,
                  ]}
                >
                  <InputField
                    placeholder="Juan"
                    placeholderTextColor={COLORS.placeholder}
                    value={firstName}
                    onChangeText={setFirstName}
                    onFocus={() => setFirstNameFocused(true)}
                    onBlur={() => {
                      setFirstNameFocused(false);
                      setTouched(prev => ({ ...prev, firstName: true }));
                    }}
                    autoCapitalize="words"
                    className="text-[#171815]"
                    style={styles.inputField}
                  />
                </Input>
                {touched.firstName && validationErrors.firstName && (
                  <Text style={styles.errorText}>{validationErrors.firstName}</Text>
                )}
              </View>

              {/* Last Name Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Last Name <Text style={styles.requiredAsterisk}>*</Text></Text>
                <Input
                  variant="outline"
                  size="xl"
                  style={[
                    styles.inputContainer,
                    lastNameFocused && styles.inputFocused,
                    touched.lastName && validationErrors.lastName && styles.inputError,
                  ]}
                >
                  <InputField
                    placeholder="Dela Cruz"
                    placeholderTextColor={COLORS.placeholder}
                    value={lastName}
                    onChangeText={setLastName}
                    onFocus={() => setLastNameFocused(true)}
                    onBlur={() => {
                      setLastNameFocused(false);
                      setTouched(prev => ({ ...prev, lastName: true }));
                    }}
                    autoCapitalize="words"
                    className="text-[#171815]"
                    style={styles.inputField}
                  />
                </Input>
                {touched.lastName && validationErrors.lastName && (
                  <Text style={styles.errorText}>{validationErrors.lastName}</Text>
                )}
              </View>

              {/* Phone Number Input - Using plain View wrapper */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone Number <Text style={styles.requiredAsterisk}>*</Text></Text>
                <View
                  style={[
                    styles.phoneInputContainer,
                    phoneFocused && styles.inputFocused,
                    touched.phoneNumber && validationErrors.phoneNumber && styles.inputError,
                  ]}
                >
                  {/* Philippine Flag and Country Code */}
                  <View style={styles.phonePrefix}>
                    <PhilippineFlag width={24} height={16} />
                    <View style={styles.phoneDivider} />
                    <Text style={styles.countryCode}>+63</Text>
                  </View>
                  {/* Native TextInput for phone number */}
                  <TextInput
                    placeholder="123 456 7890"
                    placeholderTextColor={COLORS.placeholder}
                    value={phoneNumber}
                    onChangeText={handlePhoneChange}
                    onFocus={() => setPhoneFocused(true)}
                    onBlur={() => {
                      setPhoneFocused(false);
                      setTouched(prev => ({ ...prev, phoneNumber: true }));
                    }}
                    keyboardType="phone-pad"
                    maxLength={12}
                    style={styles.phoneTextInput}
                  />
                </View>
                {touched.phoneNumber && validationErrors.phoneNumber && (
                  <Text style={styles.errorText}>{validationErrors.phoneNumber}</Text>
                )}
              </View>
            </View>

            {/* Action Buttons Container */}
            <View style={styles.buttonsContainer}>
              {/* Tooltip positioned above the button */}
              {showTooltip && (
                <View style={styles.tooltipContainer}>
                  <View style={styles.tooltipContent}>
                    <Text style={styles.tooltipText}>Coming Soon, Skip for now</Text>
                  </View>
                  <View style={styles.tooltipArrow} />
                </View>
              )}

              {/* Additional Details Button */}
              <Button
                size="xl"
                action="primary"
                style={styles.additionalDetailsButton}
                onPress={handleAdditionalDetails}
                disabled={buttonLoading}
              >
                {buttonLoading ? (
                  <ButtonSpinner color={COLORS.buttonTextDark} />
                ) : (
                  <ButtonText style={styles.additionalDetailsButtonText}>
                    Additional Details
                  </ButtonText>
                )}
              </Button>

              {/* Skip Button - Disabled until all fields are valid */}
              <Pressable 
                onPress={handleSkip} 
                style={[
                  styles.skipButton,
                  (!isFormValid || buttonLoading) && styles.skipButtonDisabled,
                ]} 
                disabled={!isFormValid || buttonLoading}
              >
                <Text style={[
                  styles.skipButtonText,
                  (!isFormValid || buttonLoading) && styles.skipButtonTextDisabled,
                ]}>
                  {isFormValid ? 'Next' : 'Skip'}
                </Text>
              </Pressable>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              <Text style={styles.footerLink} onPress={handleOpenPrivacyPolicy}>Privacy Policy</Text>
              <Text>. </Text>
              <Text style={styles.footerLink} onPress={handleOpenTermsOfService}>Terms of Service</Text>
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  keyboardAvoid: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  backButtonContainer: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  backButton: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  title: {
    fontFamily: 'CubaoFree2-ExtraExpanded',
    fontSize: 16,
    color: '#0E0F0C',
    textAlign: 'center',
    marginBottom: 28,
    letterSpacing: 0.16,
    textTransform: 'uppercase',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
    justifyContent: 'space-between',
    flexGrow: 1,
  },
  inputSection: {
    width: '100%',
    gap: 16,
  },
  inputGroup: {
    width: '100%',
    paddingHorizontal: 1,
  },
  inputLabel: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textDark900,
    lineHeight: 16,
    marginBottom: 10,
  },
  inputContainer: {
    borderWidth: 1,
    borderColor: COLORS.borderLight300,
    borderRadius: 5,
    height: 44,
    backgroundColor: COLORS.white,
  },
  inputContainerDisabled: {
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    height: 28,
    overflow: 'hidden',
  },
  inputFocused: {
    borderColor: COLORS.paraBrand,
    borderWidth: 1.5,
  },
  inputField: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textDark900,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flex: 1,
  },
  phoneInputField: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textDark900,
    paddingHorizontal: 8,
    paddingVertical: 10,
    flex: 1,
    height: '100%',
  },
  inputFieldDisabled: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.placeholder,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight300,
    borderRadius: 5,
    height: 44,
    backgroundColor: COLORS.white,
  },
  phonePrefix: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 8,
    height: '100%',
  },
  phoneTextInput: {
    flex: 1,
    height: '100%',
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textDark900,
    paddingHorizontal: 4,
    paddingVertical: 0,
  },
  countryCode: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textDark900,
  },
  buttonsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 32,
    position: 'relative',
  },
  tooltipContainer: {
    position: 'absolute',
    bottom: '100%',
    left: 24,
    marginBottom: 6,
    alignItems: 'flex-start',
    zIndex: 100,
  },
  tooltipContent: {
    backgroundColor: COLORS.tooltipBg,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 4,
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  tooltipText: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.tooltipText,
    lineHeight: 16,
  },
  tooltipArrow: {
    width: 0,
    height: 0,
    marginLeft: 16,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: COLORS.tooltipBg,
  },
  additionalDetailsButton: {
    flex: 1,
    height: 44,
    backgroundColor: COLORS.paraBrand,
    borderRadius: 22,
    opacity: 0.6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  additionalDetailsButtonText: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.buttonTextDark,
  },
  skipButton: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 68,
  },
  skipButtonDisabled: {
    opacity: 0.5,
  },
  skipButtonText: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.buttonTextDark,
    textDecorationLine: 'underline',
  },
  skipButtonTextDisabled: {
    color: COLORS.placeholder,
  },
  footer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  footerText: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textDark900,
    textAlign: 'center',
  },
  footerLink: {
    textDecorationLine: 'underline',
  },
  // Validation styles
  inputError: {
    borderColor: '#DC2626',
    borderWidth: 1.5,
  },
  errorText: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: '#DC2626',
    marginTop: 4,
  },
  requiredAsterisk: {
    color: '#DC2626',
  },
  phoneDivider: {
    width: 1,
    height: 20,
    backgroundColor: COLORS.borderLight300,
    marginHorizontal: 10,
  },
});

export default CompleteDetailsScreen;
