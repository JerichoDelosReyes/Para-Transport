import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Image, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS, TYPOGRAPHY, RADIUS} from '../constants/theme';
import type { POIFeature } from '../types/poi';
import type { MatchedRoute } from '../services/routeSearch';
import BottomSheet from './BottomSheet';
import { useTheme } from '../src/theme/ThemeContext';
import { useStore } from '../store/useStore';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const POI_DRAWER_FULL_HEIGHT = SCREEN_HEIGHT * 0.38;
const POI_DRAWER_HALF_HEIGHT = SCREEN_HEIGHT * 0.32;

type PoiDrawerProps = {
  poi: POIFeature | null;
  matchedRoute?: MatchedRoute | null;
  onClose: () => void;
  onRouteHere: (poi: POIFeature) => void;
  onSavePoi?: (poi: POIFeature) => void;
};

export default function PoiDrawer({ poi, matchedRoute, onClose, onRouteHere, onSavePoi }: PoiDrawerProps) {
  const { theme, isDark } = useTheme();
  const { user, saveRoute, removeSavedRoute } = useStore();
  
  const savedRoutes = user?.saved_routes || [];
  
  const isSaved = useMemo(() => {
    if (!poi) return false;
    const poiId = String(poi.properties.id || poi.properties.title);
    return savedRoutes.some((r: any) => String(r.id) === poiId);
  }, [poi, savedRoutes]);

  const handleToggleSave = () => {
    if (!poi) return;
    const poiId = String(poi.properties.id || poi.properties.title);
    
    if (isSaved) {
      removeSavedRoute(poiId);
    } else {
      saveRoute({
        id: poiId,
        name: `Current Location to ${poi.properties.title}`,
        legs: [
          {
            mode: 'Custom Route',
            from: 'Current Location',
            to: poi.properties.title,
            fromObj: 'Current Location',
            toObj: { 
              title: poi.properties.title, 
              coords: poi.geometry.coordinates 
            }
          }
        ],
        total_fare: null,
        estimated_minutes: null,
        total_km: null
      });
      
      onClose();
      router.push('/(tabs)/saved');
    }
  };

  const typeLabel = useMemo(() => {
    if (!poi) return 'PLACE';
    return String(poi.properties.landmark_type || poi.properties.category || 'Place')
      .replace(/_/g, ' ')
      .toUpperCase();
  }, [poi]);

  const title = poi?.properties.title || '';

  return (
    <BottomSheet
      visible={!!poi}
      onClose={onClose}
      title="PLACES"
      snapPoints={{ full: POI_DRAWER_FULL_HEIGHT, half: POI_DRAWER_HALF_HEIGHT }}
    >
      <ScrollView contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        <Text style={[styles.poiTitle, { color: theme.text }]} numberOfLines={2}>
          {title}
        </Text>

        <Text style={[styles.poiCategory, { color: theme.textSecondary }]}>{typeLabel}</Text>

        <View style={styles.actionsRow}>
          <TouchableOpacity 
            style={[styles.routeButton, { backgroundColor: isDark ? '#E8A020' : COLORS.primary }]} 
            activeOpacity={0.9} 
            onPress={() => poi && onRouteHere(poi)}
          >
            <Text style={[styles.routeButtonText, { color: COLORS.navy }]}>Check Directions</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#E6E6E6' }]}
            activeOpacity={0.85}
            onPress={() => {
              handleToggleSave();
              if (poi && onSavePoi) onSavePoi(poi);
            }}
          >
            <Ionicons name={isSaved ? "bookmark" : "bookmark-outline"} size={22} color={isSaved ? (isDark ? '#E8A020' : COLORS.primary) : theme.text} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 24,
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
    marginTop: 16,
  },
  routeButton: {
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
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#E6E6E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
