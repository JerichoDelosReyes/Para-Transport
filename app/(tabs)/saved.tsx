import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Modal, Alert, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import JeepIllustration from '../../assets/illustrations/welcomeScreen-jeep2.svg';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../../constants/theme';
import { ProfileButton } from '../../components/ProfileButton';
import { useStore } from '../../store/useStore';

export default function SavedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomSpace = insets.bottom > 0 ? insets.bottom * 0.6 : 24;
  const bottomPadding = 48 + bottomSpace + 16;
  const { user, removeSavedRoute, setSelectedTransitRoute, setPendingRouteSearch } = useStore();
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
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>SAVED</Text>
        <ProfileButton />
      </View>

      <ScrollView style={{ flex: 1, backgroundColor: COLORS.background }} contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]} showsVerticalScrollIndicator={false}>
        {savedRoutes.length === 0 && (
          <View style={styles.emptyState}>
            <JeepIllustration width={220} height={150} />
            <Text style={styles.emptyTitle}>Wala pang saved.</Text>
          </View>
        )}

        {savedRoutes.map((route) => (
          <View key={route.id} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.routeName}>{route.name}</Text>
              <TouchableOpacity onPress={() => confirmRemove(route.id)}>
                <Ionicons name="bookmark" size={18} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.legSummary}>{route.legs.map((leg: any) => leg.mode).join(' • ')}</Text>
            <View style={styles.cardBottom}>
              <Text style={styles.fare}>{route.total_fare ? `₱${route.total_fare.toFixed(2)}` : 'FARE VARIES'}</Text>
              <TouchableOpacity style={styles.ghostButton} activeOpacity={0.9} onPress={() => openModal(route)}>
                <Text style={styles.ghostButtonText}>View</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal visible={isModalVisible} animationType="fade" transparent>
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            {selectedRoute && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle} numberOfLines={2}>
                    {selectedRoute.name}
                  </Text>
                  <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close" size={24} color={COLORS.navy} />
                  </TouchableOpacity>
                </View>
                
                <View style={styles.modalBody}>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Fare</Text>
                    <Text style={styles.modalValue}>{selectedRoute?.total_fare ? `₱${selectedRoute.total_fare.toFixed(2)}` : 'FARE VARIES'}</Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Estimated Time</Text>
                    <Text style={styles.modalValue}>{selectedRoute?.estimated_minutes ? `${selectedRoute.estimated_minutes} mins` : 'Varies'}</Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Total Distance</Text>
                    <Text style={styles.modalValue}>{selectedRoute?.total_km ? `${selectedRoute.total_km} km` : 'Varies'}</Text>
                  </View>

                  <View style={styles.legsContainer}>
                    <Text style={styles.legsTitle}>Route Legs</Text>
                    {selectedRoute.legs.map((leg: any, i: number) => (
                      <View key={i} style={styles.legItem}>
                        <View style={styles.legPrefix}>
                          <View style={styles.legDot} />
                          {i < selectedRoute.legs.length - 1 && <View style={styles.legLine} />}
                        </View>
                        <View style={styles.legDetails}>
                          <Text style={styles.legMode}>Ride {leg.mode}</Text>
                          <Text style={styles.legRoute}>{leg.from} → {leg.to}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>

                <TouchableOpacity style={styles.primaryButton} onPress={handleViewRoute} activeOpacity={0.9}>
                  <Text style={styles.primaryButtonText}>View Route</Text>
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
