import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../constants/theme';
import type { TransitLeg } from '../utils/routeSegments';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PANEL_HEIGHT = 340;

export type RouteAlternativeId = 'recommended' | 'least_transfers' | 'fastest' | 'cheapest' | 'shortest';

type RouteAlternative = {
  id: RouteAlternativeId;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  accentColor: string;
  bgColor: string;
};

const ROUTE_ALTERNATIVES: RouteAlternative[] = [
  {
    id: 'recommended',
    label: 'Recommended',
    description: 'Best overall balance of speed, cost and transfers',
    icon: 'star',
    accentColor: '#E8A020',
    bgColor: '#FFF8E1',
  },
  {
    id: 'least_transfers',
    label: 'Least Transfers',
    description: 'Minimise the number of vehicle changes',
    icon: 'swap-vertical',
    accentColor: '#3B82F6',
    bgColor: '#EFF6FF',
  },
  {
    id: 'fastest',
    label: 'Fastest',
    description: 'Arrive at your destination the quickest',
    icon: 'flash',
    accentColor: '#F97316',
    bgColor: '#FFF7ED',
  },
  {
    id: 'cheapest',
    label: 'Cheapest',
    description: 'Lowest total fare for the trip',
    icon: 'cash',
    accentColor: '#22C55E',
    bgColor: '#F0FDF4',
  },
  {
    id: 'shortest',
    label: 'Shortest Distance',
    description: 'Least distance travelled overall',
    icon: 'resize',
    accentColor: '#8B5CF6',
    bgColor: '#F5F3FF',
  },
];

type Props = {
  visible: boolean;
  routeSummary: { distanceKm: number; durationMin: number } | null;
  transitLegs: TransitLeg[];
  onClose: () => void;
};

export default function RouteRecommenderPanel({
  visible,
  routeSummary,
  transitLegs,
  onClose,
}: Props) {
  const panY = useRef(new Animated.Value(PANEL_HEIGHT)).current;
  const lastOffset = useRef(PANEL_HEIGHT);
  const [selectedAlt, setSelectedAlt] = useState<RouteAlternativeId>('recommended');

  React.useEffect(() => {
    if (visible) {
      Animated.spring(panY, {
        toValue: 0,
        useNativeDriver: false,
        bounciness: 4,
      }).start();
      lastOffset.current = 0;
    } else {
      Animated.timing(panY, {
        toValue: PANEL_HEIGHT,
        duration: 300,
        useNativeDriver: false,
      }).start();
      lastOffset.current = PANEL_HEIGHT;
    }
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 10,
      onPanResponderGrant: () => {
        panY.setOffset(lastOffset.current);
        panY.setValue(0);
      },
      onPanResponderMove: (_, gs) => {
        panY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        panY.flattenOffset();
        if (gs.dy > 40 || gs.vy > 0.4) {
          Animated.spring(panY, {
            toValue: PANEL_HEIGHT,
            useNativeDriver: false,
            bounciness: 4,
          }).start(() => {
            lastOffset.current = PANEL_HEIGHT;
            onClose();
          });
          return;
        }
        Animated.spring(panY, {
          toValue: 0,
          useNativeDriver: false,
          bounciness: 4,
        }).start(() => {
          lastOffset.current = 0;
        });
      },
    })
  ).current;

  if (!visible && lastOffset.current === PANEL_HEIGHT) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: panY }],
          height: PANEL_HEIGHT,
        },
      ]}
    >
      {/* Drag handle area */}
      <View {...panResponder.panHandlers} style={styles.handleArea}>
        <View style={styles.dragHandle} />
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Ionicons name="options" size={20} color={COLORS.navy} />
            <Text style={styles.title}>ROUTE OPTIONS</Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={24} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Route alternatives list */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {ROUTE_ALTERNATIVES.map((alt) => {
          const isActive = selectedAlt === alt.id;
          return (
            <TouchableOpacity
              key={alt.id}
              activeOpacity={0.7}
              onPress={() => setSelectedAlt(alt.id)}
              style={[
                styles.altCard,
                { backgroundColor: isActive ? alt.bgColor : '#FFFFFF' },
                isActive && { borderColor: alt.accentColor, borderWidth: 1.5 },
              ]}
            >
              <View style={[styles.altIconWrap, { backgroundColor: isActive ? alt.accentColor : 'rgba(10,22,40,0.06)' }]}>
                <Ionicons name={alt.icon as any} size={18} color={isActive ? '#FFFFFF' : COLORS.textMuted} />
              </View>
              <View style={styles.altTextWrap}>
                <Text style={[styles.altLabel, isActive && { color: alt.accentColor }]}>
                  {alt.label}
                </Text>
                <Text style={styles.altDesc} numberOfLines={1}>{alt.description}</Text>
              </View>
              {isActive && (
                <Ionicons name="checkmark-circle" size={22} color={alt.accentColor} />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 14,
    zIndex: 30,
  },
  handleArea: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: SPACING.screenX,
  },
  dragHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(10,22,40,0.2)',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontFamily: 'Cubao',
    fontSize: 20,
    color: COLORS.navy,
    letterSpacing: 0.5,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.screenX,
    paddingBottom: 32,
    paddingTop: 4,
    gap: 8,
  },
  altCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: 'rgba(10,22,40,0.06)',
    gap: 12,
  },
  altIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  altTextWrap: {
    flex: 1,
    gap: 2,
  },
  altLabel: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.navy,
  },
  altDesc: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: COLORS.textMuted,
  },
});
