import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Animated, PanResponder } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import JeepIllustration from '../assets/illustrations/welcomeScreen-jeep.svg';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import { useMemo, useRef, useState } from 'react';
import { useStore } from '../store/useStore';

type Doodle = {
  id: number;
  icon?: keyof typeof Ionicons.glyphMap;
  text?: string;
  top: `${number}%`;
  left: `${number}%`;
  size: number;
  rotate: string;
  opacity: number;
};

const DOODLES: Doodle[] = [
  { id: 1, icon: 'git-merge-outline', top: '10%', left: '7%', size: 24, rotate: '-20deg', opacity: 0.2 },
  { id: 2, icon: 'locate-outline', top: '8%', left: '78%', size: 22, rotate: '15deg', opacity: 0.16 },
  { id: 3, icon: 'cash-outline', top: '18%', left: '87%', size: 22, rotate: '-15deg', opacity: 0.18 },
  { id: 4, icon: 'trail-sign-outline', top: '21%', left: '10%', size: 24, rotate: '23deg', opacity: 0.18 },
  { id: 5, icon: 'car-outline', top: '24%', left: '70%', size: 21, rotate: '-18deg', opacity: 0.19 },
  { id: 6, icon: 'navigate-outline', top: '33%', left: '14%', size: 22, rotate: '28deg', opacity: 0.2 },
  { id: 7, icon: 'ellipse-outline', top: '37%', left: '84%', size: 20, rotate: '-8deg', opacity: 0.16 },
  { id: 8, icon: 'swap-horizontal-outline', top: '42%', left: '8%', size: 24, rotate: '18deg', opacity: 0.21 },
  { id: 9, icon: 'location-outline', top: '44%', left: '80%', size: 18, rotate: '-25deg', opacity: 0.18 },
  { id: 10, icon: 'return-down-forward-outline', top: '56%', left: '12%', size: 20, rotate: '-28deg', opacity: 0.18 },
  { id: 11, icon: 'star-outline', top: '58%', left: '86%', size: 18, rotate: '30deg', opacity: 0.2 },
  { id: 12, icon: 'shuffle-outline', top: '63%', left: '75%', size: 22, rotate: '-12deg', opacity: 0.18 },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const setUser = useStore((state) => state.setUser);
  const [showAuthPopup, setShowAuthPopup] = useState(false);
  const insets = useSafeAreaInsets();
  const sheetTranslateY = useRef(new Animated.Value(0)).current;

  const resetSheetPosition = () => {
    Animated.spring(sheetTranslateY, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 0,
    }).start();
  };

  const dismissSheet = () => {
    Animated.timing(sheetTranslateY, {
      toValue: 420,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setShowAuthPopup(false);
      sheetTranslateY.setValue(0);
    });
  };

  const sheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          gestureState.dy > 1 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 0.5,
        onMoveShouldSetPanResponderCapture: (_, gestureState) =>
          gestureState.dy > 1 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 0.5,
        onPanResponderMove: (_, gestureState) => {
          if (gestureState.dy > 0) {
            sheetTranslateY.setValue(gestureState.dy);
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy > 40 || gestureState.vy > 0.45) {
            dismissSheet();
            return;
          }
          resetSheetPosition();
        },
        onPanResponderTerminate: resetSheetPosition,
      }),
    [sheetTranslateY]
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.canvas}>
        {DOODLES.map((doodle) => (
          <View
            key={doodle.id}
            style={[
              styles.doodle,
              {
                top: doodle.top,
                left: doodle.left,
                opacity: doodle.opacity,
                transform: [{ rotate: doodle.rotate }],
              },
            ]}
          >
            {doodle.text ? (
              <Text style={[styles.doodleText, { fontSize: doodle.size }]}>{doodle.text}</Text>
            ) : (
              <Ionicons name={doodle.icon!} size={doodle.size} color={COLORS.navy} />
            )}
          </View>
        ))}

        <View style={styles.topSection}>
          <Text style={styles.headline}>STRESS-FREE</Text>
          <Text style={styles.headline}>COMMUTING</Text>
          <View style={styles.subtitleRow}>
            <Text style={styles.subtitleBase}>All in the hands of </Text>
            <Text style={styles.subtitleEvery}>every</Text>
            <Text style={styles.subtitleBase}> </Text>
            <Text style={styles.subtitleFilipino}>Filipino</Text>
          </View>
        </View>

        <View style={styles.heroZone}>
          <JeepIllustration width="108%" height="108%" />
        </View>
      </View>

      <View style={[styles.bottomSheet, { paddingBottom: Math.max(insets.bottom + 12, 34) }]}>
        <Text style={styles.sheetTitle}>Welcome to Para!</Text>
        <Text style={styles.sheetSubtitle}>
          Your smart transit companion. Plan optimal routes and navigate the city with ease.
        </Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => setShowAuthPopup(true)}
          activeOpacity={0.9}
        >
          <Text style={styles.primaryButtonText}>Get Started</Text>
        </TouchableOpacity>
      </View>

      <Modal
        transparent
        visible={showAuthPopup}
        animationType="fade"
        onRequestClose={() => setShowAuthPopup(false)}
      >
        <View style={styles.modalOverlay} {...sheetPanResponder.panHandlers}>
          <TouchableOpacity
            style={styles.modalScrimTapZone}
            activeOpacity={1}
            onPress={() => setShowAuthPopup(false)}
          />

          <Animated.View
            style={[styles.modalSheet, { transform: [{ translateY: sheetTranslateY }] }]}
            {...sheetPanResponder.panHandlers}
          >
            <View style={styles.handle} />

            <Text style={styles.modalTitle}>Login or Sign up</Text>
            <Text style={styles.modalSubtitle}>
              Choose your preferred method to continue to Para.
            </Text>

            <TouchableOpacity
              style={styles.modalPrimaryAction}
              onPress={() => {
                setShowAuthPopup(false);
                router.push('/login');
              }}
              activeOpacity={0.9}
            >
              <Text style={styles.modalPrimaryText}>Log in</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalSecondaryAction}
              onPress={() => {
                setShowAuthPopup(false);
                router.push('/register');
              }}
              activeOpacity={0.9}
            >
              <Text style={styles.modalSecondaryText}>Sign up</Text>
            </TouchableOpacity>

            <Text style={styles.modalFooterText}>
              By continuing, you agree to Privacy Policy and Terms of Service.
            </Text>

            <TouchableOpacity
              style={styles.guestLinkWrap}
              onPress={() => {
                setUser({
                  name: 'Komyuter',
                  email: 'guest@para.ph',
                  points: 0,
                  streak_count: 0,
                  total_km: 0,
                  total_fare_spent: 0,                  saved_routes: [],
                  badges: [],                });
                setShowAuthPopup(false);
                router.replace('/(tabs)');
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.guestLink}>Continue as guest</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  canvas: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  doodle: {
    position: 'absolute',
  },
  doodleText: {
    fontFamily: 'Cubao',
    color: COLORS.navy,
  },
  topSection: {
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: SPACING.screenX,
  },
  headline: {
    fontFamily: 'Cubao',
    fontSize: 34,
    lineHeight: 34,
    color: COLORS.navy,
    textAlign: 'center',
  },
  subtitleRow: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  subtitleBase: {
    fontFamily: 'Inter-Italic',
    fontSize: 15,
    color: COLORS.textMuted,
  },
  subtitleEvery: {
    fontFamily: 'Inter-Italic',
    fontSize: 15,
    color: '#284395',
  },
  subtitleFilipino: {
    fontFamily: 'Inter-Italic',
    fontSize: 15,
    color: '#EF2836',
  },
  heroZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    marginTop: -40,
    marginBottom: 0,
  },
  halo: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: 'rgba(245,197,24,0.18)',
  },
  bottomSheet: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 0,
    marginTop: -60,
    paddingHorizontal: SPACING.screenX,
    paddingTop: 20,
    paddingBottom: 18,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  sheetTitle: {
    textAlign: 'center',
    fontFamily: 'Inter',
    fontSize: 34,
    fontWeight: '700',
    color: COLORS.navy,
  },
  sheetSubtitle: {
    marginTop: 12,
    marginBottom: 28,
    textAlign: 'center',
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textMuted,
  },
  primaryButton: {
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
    marginBottom: 20,
  },
  primaryButtonText: {
    fontFamily: 'Inter',
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.navy,
  },
  primaryArrow: {
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  modalScrimTapZone: {
    flex: 1,
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: SPACING.screenX,
    paddingTop: 12,
    paddingBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
    marginBottom: 10,
  },
  modalTitle: {
    marginTop: 2,
    fontFamily: 'Inter',
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.navy,
    textAlign: 'center',
  },
  modalSubtitle: {
    marginTop: 8,
    fontFamily: 'Inter',
    fontSize: 15,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 16,
  },
  modalPrimaryAction: {
    height: 54,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  modalPrimaryText: {
    fontFamily: 'Inter',
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.navy,
  },
  modalSecondaryAction: {
    marginTop: 10,
    height: 54,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
    borderColor: '#EFEFEF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSecondaryText: {
    fontFamily: 'Inter',
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.navy,
  },
  modalFooterText: {
    marginTop: 14,
    textAlign: 'center',
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.textMuted,
  },
  guestLinkWrap: {
    marginTop: 12,
    alignItems: 'center',
  },
  guestLink: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.textMuted,
    textDecorationLine: 'underline',
  },
});
