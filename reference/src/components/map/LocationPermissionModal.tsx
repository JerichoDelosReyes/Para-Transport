/**
 * LocationPermissionModal Component
 * 
 * Para-branded modal for requesting location permissions.
 * Provides a friendly explanation before triggering the system permission dialog.
 * Includes option to open Settings if permission was previously denied.
 * 
 * @module components/map/LocationPermissionModal
 */

import React, { useCallback } from 'react';
import {
  StyleSheet,
  View,
  Modal,
  Pressable,
  Platform,
  Linking,
} from 'react-native';
import { MapPin, Navigation, X, Settings, Shield } from 'lucide-react-native';
import * as Location from 'expo-location';

import { Text } from '../../../components/ui/text';

// =============================================================================
// Constants
// =============================================================================

const COLORS = {
  white: '#FFFFFF',
  paraBrand: '#E9AE16',
  paraBrandLight: '#FFF8E7',
  paraBrandDark: '#C99200',
  black: '#1C1B1F',
  textDark900: '#181818',
  textDark: '#1C1B1F',
  textGray: '#6B7280',
  grayLight: '#F3F4F6',
  grayMedium: '#9CA3AF',
  border: '#E5E7EB',
  overlay: 'rgba(0, 0, 0, 0.5)',
  success: '#10B981',
  error: '#EF4444',
} as const;

// =============================================================================
// Types
// =============================================================================

export interface LocationPermissionModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Callback when modal is closed (cancel/backdrop tap) */
  onClose: () => void;
  /** Callback when permission is granted */
  onPermissionGranted: (coordinates: { latitude: number; longitude: number }) => void;
  /** Callback when permission is denied */
  onPermissionDenied: () => void;
  /** Whether permission was previously denied (show Settings option) */
  wasPreviouslyDenied?: boolean;
}

// =============================================================================
// Component
// =============================================================================

/**
 * LocationPermissionModal displays a branded explanation modal
 * before requesting location permissions.
 * 
 * @example
 * ```tsx
 * <LocationPermissionModal
 *   visible={showPermissionModal}
 *   onClose={() => setShowPermissionModal(false)}
 *   onPermissionGranted={(coords) => handleLocationSet(coords)}
 *   onPermissionDenied={() => showDeniedToast()}
 * />
 * ```
 */
export const LocationPermissionModal: React.FC<LocationPermissionModalProps> = ({
  visible,
  onClose,
  onPermissionGranted,
  onPermissionDenied,
  wasPreviouslyDenied = false,
}) => {
  /**
   * Request location permission and get current position
   */
  const handleAllowLocation = useCallback(async () => {
    try {
      // Request permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status === 'granted') {
        // Get current location
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        
        onPermissionGranted({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
        onClose();
      } else {
        onPermissionDenied();
      }
    } catch (error) {
      console.error('[LocationPermissionModal] Error requesting permission:', error);
      onPermissionDenied();
    }
  }, [onPermissionGranted, onPermissionDenied, onClose]);

  /**
   * Open device settings for the app
   */
  const handleOpenSettings = useCallback(async () => {
    try {
      if (Platform.OS === 'ios') {
        await Linking.openURL('app-settings:');
      } else {
        await Linking.openSettings();
      }
      onClose();
    } catch (error) {
      console.error('[LocationPermissionModal] Error opening settings:', error);
    }
  }, [onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        
        <View style={styles.modalContainer}>
          {/* Close Button */}
          <Pressable style={styles.closeButton} onPress={onClose}>
            <X size={24} color={COLORS.textGray} />
          </Pressable>

          {/* Icon */}
          <View style={styles.iconContainer}>
            <View style={styles.iconCircle}>
              <Navigation size={32} color={COLORS.paraBrand} />
            </View>
          </View>

          {/* Title */}
          <Text style={styles.title}>
            {wasPreviouslyDenied ? 'Location Access Needed' : 'Use Your Location?'}
          </Text>

          {/* Description */}
          <Text style={styles.description}>
            {wasPreviouslyDenied
              ? 'Para needs location access to find routes near you. Please enable it in your device settings.'
              : 'Para uses your location to find the best transit routes from where you are. Your location is never shared or stored.'}
          </Text>

          {/* Benefits List */}
          {!wasPreviouslyDenied && (
            <View style={styles.benefitsList}>
              <View style={styles.benefitItem}>
                <MapPin size={18} color={COLORS.paraBrand} />
                <Text style={styles.benefitText}>Find routes starting from your location</Text>
              </View>
              <View style={styles.benefitItem}>
                <Shield size={18} color={COLORS.success} />
                <Text style={styles.benefitText}>Your privacy is protected</Text>
              </View>
            </View>
          )}

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            {wasPreviouslyDenied ? (
              <>
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={handleOpenSettings}
                >
                  <Settings size={20} color={COLORS.white} />
                  <Text style={styles.primaryButtonText}>Open Settings</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && styles.secondaryButtonPressed,
                  ]}
                  onPress={onClose}
                >
                  <Text style={styles.secondaryButtonText}>Not Now</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={handleAllowLocation}
                >
                  <Navigation size={20} color={COLORS.white} />
                  <Text style={styles.primaryButtonText}>Allow Location</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && styles.secondaryButtonPressed,
                  ]}
                  onPress={onClose}
                >
                  <Text style={styles.secondaryButtonText}>Enter Manually</Text>
                </Pressable>
              </>
            )}
          </View>

          {/* Privacy Note */}
          <Text style={styles.privacyNote}>
            You can change this anytime in Settings
          </Text>
        </View>
      </View>
    </Modal>
  );
};

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.overlay,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContainer: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
    marginHorizontal: 24,
    maxWidth: 400,
    width: '100%',
    alignItems: 'center',
    // Shadow
    ...Platform.select({
      ios: {
        shadowColor: COLORS.black,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 4,
    zIndex: 10,
  },
  iconContainer: {
    marginBottom: 16,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.paraBrandLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontFamily: 'Quiapo',
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textDark900,
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontFamily: 'Inter',
    fontSize: 15,
    color: COLORS.textGray,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  benefitsList: {
    width: '100%',
    marginBottom: 24,
    gap: 12,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 8,
  },
  benefitText: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.textDark,
    flex: 1,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.paraBrand,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    width: '100%',
  },
  buttonPressed: {
    backgroundColor: COLORS.paraBrandDark,
    transform: [{ scale: 0.98 }],
  },
  primaryButtonText: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 16,
    width: '100%',
    backgroundColor: COLORS.grayLight,
  },
  secondaryButtonPressed: {
    backgroundColor: COLORS.border,
  },
  secondaryButtonText: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.textDark,
  },
  privacyNote: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.grayMedium,
    textAlign: 'center',
    marginTop: 16,
  },
});

export default LocationPermissionModal;
