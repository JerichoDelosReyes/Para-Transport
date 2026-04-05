import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Modal, Alert, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import JeepIllustration from '../../assets/illustrations/welcomeScreen-jeep2.svg';
import { useTheme } from '../../src/theme/ThemeContext';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../../constants/theme';
import { ProfileButton } from '../../components/ProfileButton';
import { useStore } from '../../store/useStore';

export default function SavedScreen() {
  const { theme, isDark } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomSpace = insets.bottom > 0 ? insets.bottom * 0.6 : 24;
  const bottomPadding = 48 + bottomSpace + 16;
  const { user, removeSavedRoute, setSelectedTransitRoute, setPendingRouteSearch, sessionMode } = useStore();
  const isGuestAccount = sessionMode === 'guest';
  const savedRoutes = user?.saved_routes || [];
  const [selectedRoute, setSelectedRoute] = useState<any>(null);
  const [isModalVisible, setModalVisible] = useState(false);

  const confirmRemove = (id: number) => {
    Alert.alert('Remove Saved Route', 'Are you sure you want to remove this route?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeSavedRoute(id) }
    ]);
  };

  const openModal = (route: any) => {
    setSelectedRoute(route);
    setModalVisible(true);
  };

  const handleViewRoute = () => {
    if (selectedRoute) {
      setModalVisible(false);
      if (selectedRoute.legs && selectedRoute.legs[0]?.mode === 'Custom Route') {
        const origin = selectedRoute.legs[0].fromObj || selectedRoute.legs[0].from;
        const destination = selectedRoute.legs[0].toObj || selectedRoute.legs[0].to;
        setPendingRouteSearch({ origin, destination });
      } else {
        setSelectedTransitRoute(selectedRoute);
      }
      router.navigate('/(tabs)');
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: isDark ? '#E8A020' : COLORS.primary }]}>
      <View style={[styles.header, { backgroundColor: isDark ? '#E8A020' : COLORS.primary }]}>
        <Text style={[styles.headerTitle, { color: '#0A1628' }]}>SAVED</Text>
        <ProfileButton />
      </View>

      <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]} showsVerticalScrollIndicator={false}>
        {isGuestAccount ? (
          <View style={[styles.emptyState, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
            <JeepIllustration width={220} height={150} />
            <Text style={[styles.emptyTitle, { color: isDark ? '#FFFFFF' : '#0A1628' }]}>Sign in to save routes.</Text>
          </View>
        ) : savedRoutes.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
            <JeepIllustration width={220} height={150} />
            <Text style={[styles.emptyTitle, { color: isDark ? '#FFFFFF' : '#0A1628' }]}>Wala pang saved.</Text>
          </View>
        ) : (
          savedRoutes.map((route) => (
            <View key={route.id} style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
              <View style={styles.cardTop}>
                <Text style={[styles.routeName, { color: theme.text }]}>{route.name}</Text>
                <TouchableOpacity onPress={() => confirmRemove(route.id)}>
                  <Ionicons name="bookmark" size={18} color={COLORS.primary} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.legSummary, { color: theme.textSecondary }]}>{route.legs.map((leg: any) => leg.mode).join(' • ')}</Text>
              <View style={styles.cardBottom}>
                <Text style={[styles.fare, { color: isDark ? '#FFFFFF' : COLORS.navy }]}>{route.total_fare ? `₱${route.total_fare.toFixed(2)}` : 'FARE VARIES'}</Text>
                <TouchableOpacity style={[styles.ghostButton, { backgroundColor: theme.cardBackground, borderColor: isDark ? '#FFFFFF' : COLORS.navy }]} activeOpacity={0.9} onPress={() => openModal(route)}>
                  <Text style={[styles.ghostButtonText, { color: isDark ? '#FFFFFF' : COLORS.navy }]}>Details</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={isModalVisible} animationType="fade" transparent>
        <View style={styles.modalBg}>
          <View style={[styles.modalContent, { backgroundColor: theme.cardBackground }]}>
            {selectedRoute && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: theme.text }]} numberOfLines={2}>
                    {selectedRoute.name}
                  </Text>
                  <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close" size={24} color={isDark ? '#FFFFFF' : COLORS.navy} />
                  </TouchableOpacity>
                </View>
                
                <View style={styles.modalBody}>
                  <View style={styles.modalRow}>
                    <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>Fare</Text>
                    <Text style={[styles.modalValue, { color: theme.text }]}>{selectedRoute?.total_fare ? `₱${selectedRoute.total_fare.toFixed(2)}` : 'FARE VARIES'}</Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>Estimated Time</Text>
                    <Text style={[styles.modalValue, { color: theme.text }]}>{selectedRoute?.estimated_minutes ? `${selectedRoute.estimated_minutes} mins` : 'Varies'}</Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>Total Distance</Text>
                    <Text style={[styles.modalValue, { color: theme.text }]}>{selectedRoute?.total_km ? `${selectedRoute.total_km} km` : 'Varies'}</Text>
                  </View>

                  <View style={styles.legsContainer}>
                    <Text style={[styles.legsTitle, { color: theme.text }]}>Route Legs</Text>
                    {selectedRoute.legs.map((leg: any, i: number) => (
                      <View key={i} style={styles.legItem}>
                        <View style={styles.legPrefix}>
                          <View style={styles.legDot} />
                          {i < selectedRoute.legs.length - 1 && <View style={[styles.legLine, { backgroundColor: theme.cardBorder }]} />}
                        </View>
                        <View style={styles.legDetails}>
                          <Text style={[styles.legMode, { color: theme.text }]}>Ride {leg.mode}</Text>
                          <Text style={[styles.legRoute, { color: theme.textSecondary }]}>{leg.from} → {leg.to}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>

                <TouchableOpacity style={[styles.primaryButton, { backgroundColor: isDark ? '#E8A020' : COLORS.primary }]} onPress={handleViewRoute} activeOpacity={0.9}>
                  <Text style={[styles.primaryButtonText, { color: isDark ? COLORS.navy : '#000' }]}>View Route</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: SPACING.screenX,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: RADIUS.card,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  modalTitle: {
    flex: 1,
    fontFamily: 'Cubao',
    fontSize: 24,
    color: COLORS.navy,
    marginRight: 10,
  },
  closeBtn: {
    padding: 4,
  },
  modalBody: {
    marginBottom: 24,
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  modalLabel: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.textMuted,
  },
  modalValue: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textStrong,
  },
  legsContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  legsTitle: {
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: 16,
    color: COLORS.navy,
    marginBottom: 12,
  },
  legItem: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  legPrefix: {
    width: 20,
    alignItems: 'center',
    marginRight: 8,
  },
  legDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
    marginTop: 4,
  },
  legLine: {
    width: 2,
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.1)',
    marginTop: 4,
  },
  legDetails: {
    flex: 1,
    paddingBottom: 16,
  },
  legMode: {
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: 14,
    color: COLORS.textStrong,
  },
  legRoute: {
    fontFamily: 'Inter',
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  primaryButton: {
    height: 52,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.navy,
  },
  screen: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.screenX,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 64,
  },
  headerTitle: {
    fontFamily: 'Cubao',
    fontSize: TYPOGRAPHY.screenTitle,
    color: COLORS.navy,
  },
  content: {
    paddingHorizontal: SPACING.screenX,
    paddingTop: 20,
    paddingBottom: 24,
    gap: SPACING.cardGap,
  },
  emptyState: {
    alignItems: 'center',
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    backgroundColor: COLORS.card,
    padding: SPACING.cardPadding,
  },
  emptyTitle: {
    marginTop: 8,
    fontFamily: 'Cubao',
    fontSize: 24,
    color: COLORS.navy,
  },
  card: {
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: SPACING.cardPadding,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  routeName: {
    flex: 1,
    marginRight: 8,
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: TYPOGRAPHY.body,
    color: COLORS.textStrong,
  },
  legSummary: {
    marginTop: 6,
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.label,
    color: COLORS.textMuted,
  },
  cardBottom: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fare: {
    fontFamily: 'Cubao',
    fontSize: 28,
    color: COLORS.navy,
  },
  ghostButton: {
    borderRadius: RADIUS.pill,
    borderWidth: 1.2,
    borderColor: COLORS.navy,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: COLORS.card,
  },
  ghostButtonText: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.label,
    fontWeight: '600',
    color: COLORS.navy,
  },
});
