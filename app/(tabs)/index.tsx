import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MapView, { UrlTile } from 'react-native-maps';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../../constants/theme';
import { MAP_CONFIG } from '../../constants/map';

const TRAFFIC = [
  { road: 'Bacoor Boulevard', status: 'Heavy' as const },
  { road: 'Imus Crossing', status: 'Moderate' as const },
  { road: 'Dasmariñas Crossing', status: 'Light' as const },
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
  const [selectedMode, setSelectedMode] = useState('Jeepney');
  const [distance, setDistance] = useState('');

  const MODES = ['Jeepney', 'Tricycle', 'UV Express', 'Bus', 'LRT'];

  const getEstimatedFare = () => {
    if (selectedMode === 'LRT') return '₱12.00 - ₱35.00';
    if (selectedMode === 'Tricycle') return '₱15.00 fixed (local area)';

    const dist = parseFloat(distance) || 0;
    
    if (selectedMode === 'Jeepney') {
      if (dist <= 4) return '₱13.00';
      return `₱${(13 + (dist - 4) * 1.8).toFixed(2)}`;
    }
    if (selectedMode === 'UV Express') {
      if (dist <= 5) return '₱35.00';
      return `₱${(35 + (dist - 5) * 2.2).toFixed(2)}`;
    }
    if (selectedMode === 'Bus') {
      if (dist <= 5) return '₱13.00';
      return `₱${(13 + (dist - 5) * 1.85).toFixed(2)}`;
    }
    return '₱0.00';
  };

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
          <View style={styles.mapContainer}>
            <MapView
              style={styles.map}
              initialRegion={{
                latitude: 14.4296,
                longitude: 120.9367,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
              showsUserLocation={true}
              pitchEnabled={false}
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
            >
              <UrlTile
                urlTemplate={MAP_CONFIG.OSM_TILE_URL}
                maximumZ={19}
                minimumZ={1}
                flipY={false}
                zIndex={1}
                shouldReplaceMapContent={true}
              />
            </MapView>

            <View style={styles.attribution}>
              <Text style={styles.attributionText}>{MAP_CONFIG.OSM_ATTRIBUTION}</Text>
            </View>
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modeScroll}>
            {MODES.map(mode => (
              <TouchableOpacity
                key={mode}
                style={[styles.modePill, selectedMode === mode && styles.modePillActive]}
                onPress={() => setSelectedMode(mode)}
              >
                <Text style={[styles.modePillText, selectedMode === mode && styles.modePillTextActive]}>{mode}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.fareDisplayContainer}>
            <Text style={styles.fareCaption}>Estimated Fare</Text>
            <Text style={styles.fareValue} numberOfLines={1} adjustsFontSizeToFit>{getEstimatedFare()}</Text>
          </View>

          <View style={styles.distanceInputContainer}>
            <Text style={styles.inputLabel}>Enter distance (km)</Text>
            <TextInput
              style={styles.distanceInput}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={COLORS.textMuted}
              value={distance}
              onChangeText={setDistance}
            />
          </View>
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
  mapContainer: {
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  attribution: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  attributionText: {
    fontFamily: 'Inter',
    fontSize: 10,
    color: 'rgba(0,0,0,0.62)',
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
  modeScroll: {
    gap: 8,
  },
  modePill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.navy,
    marginRight: 8,
  },
  modePillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  modePillText: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.body,
    fontWeight: '600',
    color: COLORS.navy,
  },
  modePillTextActive: {
    color: COLORS.navy,
  },
  fareDisplayContainer: {
    marginVertical: 16,
  },
  distanceInputContainer: {
    marginTop: 4,
  },
  inputLabel: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.caption,
    color: COLORS.textLabel,
    marginBottom: 8,
  },
  distanceInput: {
    height: 48,
    backgroundColor: '#F5F6F8',
    borderRadius: 16,
    paddingHorizontal: 16,
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.body,
    color: COLORS.textStrong,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
});
