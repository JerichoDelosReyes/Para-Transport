import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Image, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, RADIUS} from '../constants/theme';
import type { POIFeature } from '../types/poi';
import type { MatchedRoute } from '../services/routeSearch';
import BottomSheet from './BottomSheet';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const POI_DRAWER_FULL_HEIGHT = SCREEN_HEIGHT * 0.74;
const POI_DRAWER_HALF_HEIGHT = SCREEN_HEIGHT * 0.5;

type PoiDrawerProps = {
  poi: POIFeature | null;
  matchedRoute?: MatchedRoute | null;
  onClose: () => void;
  onRouteHere: (poi: POIFeature) => void;
  onSavePoi?: (poi: POIFeature) => void;
};

export default function PoiDrawer({ poi, matchedRoute, onClose, onRouteHere, onSavePoi }: PoiDrawerProps) {
  const typeLabel = useMemo(() => {
    if (!poi) return 'PLACE';
    return String(poi.properties.landmark_type || poi.properties.category || 'Place')
      .replace(/_/g, ' ')
      .toUpperCase();
  }, [poi]);

  const title = poi?.properties.title || '';
  const distanceText =
    matchedRoute && Number.isFinite(matchedRoute.distanceKm)
      ? `: ${matchedRoute.distanceKm.toFixed(1)} km`
      : ': Travel estimate coming soon';

  return (
    <BottomSheet
      visible={!!poi}
      onClose={onClose}
      title="PLACES"
      snapPoints={{ full: POI_DRAWER_FULL_HEIGHT, half: POI_DRAWER_HALF_HEIGHT }}
    >
      <ScrollView contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        <Text style={styles.poiTitle} numberOfLines={2}>
          {title}
        </Text>

        <Text style={styles.poiCategory}>{typeLabel}</Text>

        <View style={styles.metaRow}>
          <Image
            source={require('../assets/icons/jeepney-icon-dark.png')}
            style={styles.jeepIcon}
            resizeMode="contain"
          />
          <Text style={styles.metaText}>{distanceText}</Text>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.routeButton} activeOpacity={0.9} onPress={() => poi && onRouteHere(poi)}>
            <Text style={styles.routeButtonText}>Check Directions</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.saveButton}
            activeOpacity={0.85}
            onPress={() => poi && onSavePoi?.(poi)}
          >
            <Ionicons name="bookmark-outline" size={22} color={COLORS.navy} />
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        <View style={styles.comingSoonWrap}>
          <Ionicons name="star-outline" size={42} color="rgba(10,22,40,0.45)" />
          <Text style={styles.comingSoonText}>More Details Coming Soon!</Text>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 58,
  },
  poiTitle: {
    fontFamily: 'Inter',
    fontSize: 25,
    fontWeight: '800',
    color: COLORS.navy,
    marginBottom: 8,
  },
  poiCategory: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.label,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    gap: 6,
  },
  jeepIcon: {
    width: 18,
    height: 18,
  },
  metaText: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.caption,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  routeButton: {
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
    flex: 1,
  },
  routeButtonText: {
fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.navy,
  },
  saveButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#E6E6E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    marginTop: 18,
    height: 1,
    backgroundColor: 'rgba(10,22,40,0.15)',
  },
  comingSoonWrap: {
    paddingTop: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  comingSoonText: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.label,
    fontWeight: '700',
    color: 'rgba(10,22,40,0.45)',
  },
});
