import React, { useRef, useMemo, useCallback } from 'react';
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
import { BlurView } from 'expo-blur';
import { COLORS, SPACING, RADIUS } from '../constants/theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PANEL_MIN_HEIGHT = 0;
const PANEL_MAX_HEIGHT = SCREEN_HEIGHT * 0.55;

export type TransitRouteOption = {
  id: string;
  ref?: string;
  name?: string;
  type?: string;
  from?: string;
  to?: string;
  fare?: string | number;
  operator?: string;
  color?: string;
  verified?: boolean;
  coordinates?: { latitude: number; longitude: number }[];
  stops?: any[];
};

type CategoryCard = {
  key: string;
  label: string;
  description: string;
  icon: string;
  iconColor: string;
  badgeColor: string;
  route: TransitRouteOption | null;
  isCurrent: boolean;
};

type Props = {
  visible: boolean;
  routeSummary: { distanceKm: number; durationMin: number } | null;
  nearbyTransitRoutes: TransitRouteOption[];
  onSelectTransitRoute: (route: TransitRouteOption) => void;
  onClose: () => void;
};

function parseFare(fare?: string | number): number {
  if (fare == null) return Infinity;
  if (typeof fare === 'number') return fare;
  const str = String(fare);
  const match = str.match(/[\d,]+(\.\d+)?/);
  if (!match) return Infinity;
  return parseFloat(match[0].replace(',', ''));
}

export default function RouteRecommenderPanel({
  visible,
  routeSummary,
  nearbyTransitRoutes,
  onSelectTransitRoute,
  onClose,
}: Props) {
  const panY = useRef(new Animated.Value(PANEL_MAX_HEIGHT)).current;
  const lastOffset = useRef(PANEL_MAX_HEIGHT);

  React.useEffect(() => {
    if (visible) {
      Animated.spring(panY, {
        toValue: PANEL_MIN_HEIGHT,
        useNativeDriver: false,
        bounciness: 4,
      }).start();
      lastOffset.current = PANEL_MIN_HEIGHT;
    } else {
      Animated.timing(panY, {
        toValue: PANEL_MAX_HEIGHT,
        duration: 300,
        useNativeDriver: false,
      }).start();
      lastOffset.current = PANEL_MAX_HEIGHT;
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
        if (gs.dy > 0) {
          panY.setValue(gs.dy);
        }
      },
      onPanResponderRelease: (_, gs) => {
        panY.flattenOffset();
        if (gs.dy > 100 || gs.vy > 0.5) {
          Animated.timing(panY, {
            toValue: PANEL_MAX_HEIGHT,
            duration: 300,
            useNativeDriver: false,
          }).start(() => onClose());
          lastOffset.current = PANEL_MAX_HEIGHT;
        } else {
          Animated.spring(panY, {
            toValue: PANEL_MIN_HEIGHT,
            useNativeDriver: false,
            bounciness: 4,
          }).start();
          lastOffset.current = PANEL_MIN_HEIGHT;
        }
      },
    })
  ).current;

  const categories = useMemo((): CategoryCard[] => {
    const cards: CategoryCard[] = [];

    // 1. Fastest Route = the current OSRM-calculated route (always first)
    cards.push({
      key: 'fastest',
      label: 'Fastest Route',
      description: routeSummary
        ? `${routeSummary.distanceKm.toFixed(1)} km • ${Math.ceil(routeSummary.durationMin)} min`
        : 'Current calculated route',
      icon: 'flash',
      iconColor: '#E8A020',
      badgeColor: '#FFF3D0',
      route: null,
      isCurrent: true,
    });

    const addedIds = new Set<string>();

    // 2. Cheapest Route = transit route with the lowest fare
    const withFares = nearbyTransitRoutes.filter(
      (r) => r.fare && parseFare(r.fare) < Infinity
    );
    if (withFares.length > 0) {
      const sorted = [...withFares].sort((a, b) => parseFare(a.fare) - parseFare(b.fare));
      const cheapest = sorted[0];
      cards.push({
        key: `cheapest-${cheapest.id}`,
        label: 'Cheapest Route',
        description: cheapest.fare != null ? `Fare: ${typeof cheapest.fare === 'number' ? `₱${cheapest.fare}` : cheapest.fare}` : 'Lowest fare option',
        icon: 'wallet',
        iconColor: '#22C55E',
        badgeColor: '#DCFCE7',
        route: cheapest,
        isCurrent: false,
      });
      addedIds.add(cheapest.id);
    }

    // 3. Least Transfers = verified/direct route (single vehicle, no transfers)
    const directRoutes = nearbyTransitRoutes.filter((r) => {
      if (addedIds.has(r.id)) return false;
      return r.verified === true || r.type === 'jeepney';
    });
    if (directRoutes.length > 0) {
      const best = directRoutes[0];
      cards.push({
        key: `least-transfer-${best.id}`,
        label: 'Least Transfers',
        description: 'Direct route — no transfers needed',
        icon: 'git-merge',
        iconColor: '#3B82F6',
        badgeColor: '#DBEAFE',
        route: best,
        isCurrent: false,
      });
      addedIds.add(best.id);
    }

    // 4. Alternatives
    nearbyTransitRoutes.forEach((r) => {
      if (!addedIds.has(r.id) && cards.length < 6) {
        cards.push({
          key: `alt-${r.id}`,
          label: 'Alternative',
          description: r.from && r.to ? `${r.from} → ${r.to}` : 'Alternative transit route',
          icon: 'swap-horizontal',
          iconColor: '#8B5CF6',
          badgeColor: '#EDE9FE',
          route: r,
          isCurrent: false,
        });
        addedIds.add(r.id);
      }
    });

    return cards;
  }, [routeSummary, nearbyTransitRoutes]);

  const handleCardPress = useCallback(
    (card: CategoryCard) => {
      if (card.isCurrent) return; // Current route is already active
      if (card.route) onSelectTransitRoute(card.route);
    },
    [onSelectTransitRoute]
  );

  if (!visible && lastOffset.current === PANEL_MAX_HEIGHT) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: panY }],
          height: PANEL_MAX_HEIGHT,
        },
      ]}
    >
      {/* Drag handle area */}
      <View {...panResponder.panHandlers} style={styles.handleArea}>
        <View style={styles.dragHandle} />
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Ionicons name="map" size={20} color={COLORS.navy} />
            <Text style={styles.title}>ROUTE OPTIONS</Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={24} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>
          {nearbyTransitRoutes.length} nearby transit route
          {nearbyTransitRoutes.length !== 1 ? 's' : ''} found
        </Text>
      </View>

      {/* Scrollable route cards */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {categories.map((card) => (
          <TouchableOpacity
            key={card.key}
            style={[styles.routeCard, card.isCurrent && styles.routeCardActive]}
            activeOpacity={card.isCurrent ? 1 : 0.7}
            onPress={() => handleCardPress(card)}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.categoryBadge, { backgroundColor: card.badgeColor }]}>
                <Ionicons name={card.icon as any} size={13} color={card.iconColor} />
                <Text style={[styles.categoryText, { color: card.iconColor }]}>
                  {card.label}
                </Text>
              </View>
              {card.isCurrent && (
                <View style={styles.activePill}>
                  <Text style={styles.activePillText}>DEFAULT</Text>
                </View>
              )}
            </View>

            <View style={styles.cardBody}>
              {/* Route name / description */}
              {card.route ? (
                <>
                  <View style={styles.infoRow}>
                    <Ionicons
                      name={
                        card.route.type === 'bus'
                          ? 'bus'
                          : card.route.type === 'jeepney'
                          ? 'car'
                          : 'trail-sign'
                      }
                      size={15}
                      color={card.route.color || COLORS.navy}
                    />
                    <Text style={styles.transportLabel} numberOfLines={1}>
                      {card.route.ref ? `[${card.route.ref}] ` : ''}
                      {card.route.name || card.route.type || 'Transit'}
                    </Text>
                  </View>
                  {card.route.from || card.route.to ? (
                    <View style={styles.infoRow}>
                      <Ionicons name="navigate-outline" size={13} color={COLORS.textMuted} />
                      <Text style={styles.infoText} numberOfLines={1}>
                        {card.route.from}
                        {card.route.from && card.route.to ? ' → ' : ''}
                        {card.route.to}
                      </Text>
                    </View>
                  ) : null}
                  {card.route.fare != null ? (
                    <View style={styles.infoRow}>
                      <Ionicons name="cash-outline" size={13} color={COLORS.textMuted} />
                      <Text style={styles.infoText}>{typeof card.route.fare === 'number' ? `₱${card.route.fare}` : card.route.fare}</Text>
                    </View>
                  ) : null}
                  {card.route.verified && (
                    <View style={styles.infoRow}>
                      <Ionicons name="checkmark-circle" size={13} color="#22C55E" />
                      <Text style={[styles.infoText, { color: '#22C55E' }]}>Verified route</Text>
                    </View>
                  ) }
                </>
              ) : (
                <View style={styles.infoRow}>
                  <Ionicons name="speedometer-outline" size={15} color={COLORS.navy} />
                  <Text style={styles.transportLabel}>{card.description}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))}

        {nearbyTransitRoutes.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="bus-outline" size={28} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>
              No nearby transit routes found for this path.
            </Text>
            <Text style={styles.emptySubtext}>
              Try a different route or check the Transit layer.
            </Text>
          </View>
        )}
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
  subtitle: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textMuted,
    alignSelf: 'flex-start',
    marginTop: 2,
    marginBottom: 4,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.screenX,
    paddingBottom: 120,
  },
  routeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.card,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(10,22,40,0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  routeCardActive: {
    borderColor: '#E8A020',
    backgroundColor: 'rgba(232,160,32,0.04)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  categoryText: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '700',
  },
  activePill: {
    backgroundColor: '#E8A020',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  activePillText: {
    fontFamily: 'Inter',
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  cardBody: {
    gap: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  transportLabel: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.navy,
    flex: 1,
  },
  infoText: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textMuted,
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  emptySubtext: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    opacity: 0.7,
  },
});
