import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../../constants/theme';

const TRAFFIC = [
  { road: 'Aguinaldo Highway', status: 'Light' as const },
  { road: 'Daang Hari', status: 'Moderate' as const },
  { road: 'Molino Boulevard', status: 'Heavy' as const },
];

function trafficPill(status: 'Light' | 'Moderate' | 'Heavy') {
  if (status === 'Light') {
    return { backgroundColor: COLORS.successBg, color: COLORS.successText };
  }
  if (status === 'Moderate') {
    return { backgroundColor: COLORS.moderateBg, color: COLORS.moderateText };
  }
  return { backgroundColor: COLORS.heavyBg, color: COLORS.heavyText };
}

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>HOME</Text>
        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={COLORS.textMuted} />
            <TextInput style={styles.searchInput} placeholder="Going Somewhere?" placeholderTextColor={COLORS.textMuted} />
          </View>
          <TouchableOpacity style={styles.iconButton} activeOpacity={0.85}>
            <Ionicons name="options-outline" size={20} color={COLORS.navy} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={{ flex: 1, backgroundColor: COLORS.background }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.displayHeading}>LATEST IN THE AREA</Text>
          <Text style={styles.caption}>as of today at 9:41 PM ↻</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.mapMock}>
            <Ionicons name="map-outline" size={70} color="rgba(10,22,40,0.22)" />
            <Ionicons name="location" size={34} color={COLORS.navy} style={styles.pin} />
          </View>
        </View>

        <Text style={styles.displayHeading}>LIVE TRAFFIC NEAR LOCATION</Text>
        <View style={styles.cardList}>
          {TRAFFIC.map((item) => {
            const pill = trafficPill(item.status);
            return (
              <View key={item.road} style={styles.trafficCard}>
                <View style={styles.trafficLeft}>
                  <Ionicons name="ellipse" size={8} color="rgba(10,22,40,0.28)" />
                  <Text style={styles.trafficRoad}>{item.road}</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: pill.backgroundColor }]}>
                  <Text style={[styles.statusText, { color: pill.color }]}>{item.status}</Text>
                </View>
              </View>
            );
          })}
        </View>

        <Text style={styles.displayHeading}>FARE CALCULATOR</Text>
        <View style={styles.card}>
          <Text style={styles.fareCaption}>Minimum Fare Amount</Text>
          <Text style={styles.fareValue}>₱13.00</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.screenX,
    paddingBottom: 16,
    paddingTop: 10,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTitle: {
    fontFamily: 'Cubao',
    fontSize: TYPOGRAPHY.screenTitle,
    color: COLORS.navy,
    marginBottom: 10,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchBar: {
    flex: 1,
    height: 48,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.label,
    color: COLORS.textStrong,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(10,22,40,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  content: {
    paddingHorizontal: SPACING.screenX,
    paddingTop: 18,
    paddingBottom: 28,
    gap: SPACING.sectionGap,
  },
  sectionTitleRow: {
    gap: 4,
  },
  displayHeading: {
    fontFamily: 'Cubao',
    fontSize: 24,
    color: COLORS.navy,
    letterSpacing: 0.1,
  },
  caption: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.caption,
    color: COLORS.textMuted,
  },
  card: {
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: SPACING.cardPadding,
  },
  mapMock: {
    height: 180,
    borderRadius: 12,
    backgroundColor: '#F2EEDC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pin: {
    position: 'absolute',
  },
  cardList: {
    gap: SPACING.cardGap,
  },
  trafficCard: {
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: SPACING.cardPadding,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trafficLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trafficRoad: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.body,
    color: COLORS.text,
  },
  statusPill: {
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusText: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.caption,
    fontWeight: '600',
  },
  fareCaption: {
    fontFamily: 'Inter',
    color: COLORS.textLabel,
    fontSize: TYPOGRAPHY.label,
  },
  fareValue: {
    marginTop: 8,
    fontFamily: 'Cubao',
    fontSize: 56,
    color: COLORS.navy,
  },
});
