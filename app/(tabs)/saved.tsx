import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Modal, Alert, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import JeepIllustration from '../../assets/illustrations/welcomeScreen-jeep2.svg';
import { ROUTES } from '../../constants/routes';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../../constants/theme';

export default function SavedScreen() {
  const insets = useSafeAreaInsets();
  const bottomPadding = 60 + 36 + insets.bottom + 16;
  const [savedRoutes, setSavedRoutes] = useState(ROUTES.slice(0, 3));
  const [selectedRoute, setSelectedRoute] = useState<any>(null);
  const [isModalVisible, setModalVisible] = useState(false);

  const confirmRemove = (id: number) => {
    Alert.alert('Remove Saved Route', 'Are you sure you want to remove this route?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => setSavedRoutes(savedRoutes.filter(r => r.id !== id)) }
    ]);
  };

  const openModal = (route: any) => {
    setSelectedRoute(route);
    setModalVisible(true);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>SAVED</Text>
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
                <Ionicons name="heart" size={18} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.legSummary}>{route.legs.map((leg: any) => leg.mode).join(' • ')}</Text>
            <View style={styles.cardBottom}>
              <Text style={styles.fare}>₱{route.total_fare.toFixed(2)}</Text>
              <TouchableOpacity style={styles.ghostButton} activeOpacity={0.9} onPress={() => openModal(route)}>
                <Text style={styles.ghostButtonText}>View</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal visible={isModalVisible} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            {selectedRoute && (
              <>
                <Text style={styles.modalTitle}>{selectedRoute.name}</Text>
                <Text style={styles.modalText}>Fare: ₱{selectedRoute.total_fare.toFixed(2)}</Text>
                <Text style={styles.modalText}>Time: {selectedRoute.estimated_minutes} mins</Text>
                <Text style={styles.modalText}>Distance: {selectedRoute.total_km} km</Text>
                <TouchableOpacity style={styles.closeButton} onPress={() => setModalVisible(false)}>
                  <Text style={styles.closeButtonText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', padding: 20, borderRadius: 10 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
  modalText: { fontSize: 16, marginBottom: 5 },
  closeButton: { marginTop: 20, padding: 10, backgroundColor: COLORS.navy, borderRadius: 5, alignItems: 'center' },
  closeButtonText: { color: '#fff', fontWeight: 'bold' },
  screen: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.screenX,
    paddingTop: 10,
    paddingBottom: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
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
