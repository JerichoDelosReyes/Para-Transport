import React, { useRef, useMemo } from 'react';
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

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PANEL_HEIGHT = SCREEN_HEIGHT * 0.45;

type CommuteRoute = {
  id: string;
  origin: string;
  destination: string;
  schedule: string;
  fare: string;
  notes: string;
  transport: string;
};

type RouteOption = {
  label: string;
  icon: string;
  iconColor: string;
  badgeColor: string;
  route: CommuteRoute;
};

type Props = {
  visible: boolean;
  routes: CommuteRoute[];
  currentRoute: CommuteRoute | null;
  onSelectRoute: (route: CommuteRoute) => void;
  onClose: () => void;
};

function parseFare(fare: string): number {
  const match = fare.match(/[\d,]+(\.\d+)?/);
  if (!match) return Infinity;
  return parseFloat(match[0].replace(',', ''));
}

export default function RouteRecommenderPanel({ visible, routes, currentRoute, onSelectRoute, onClose }: Props) {
  const panY = useRef(new Animated.Value(PANEL_HEIGHT)).current;
  const lastOffset = useRef(PANEL_HEIGHT);

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
        if (gs.dy > 0) {
          panY.setValue(gs.dy);
        }
      },
      onPanResponderRelease: (_, gs) => {
        panY.flattenOffset();
        if (gs.dy > 80 || gs.vy > 0.5) {
          Animated.timing(panY, {
            toValue: PANEL_HEIGHT,
            duration: 300,
            useNativeDriver: false,
          }).start(() => onClose());
          lastOffset.current = PANEL_HEIGHT;
        } else {
          Animated.spring(panY, {
            toValue: 0,
            useNativeDriver: false,
            bounciness: 4,
          }).start();
          lastOffset.current = 0;
        }
      },
    })
  ).current;

  const categorized = useMemo(() => {
    if (routes.length === 0) return [];

    const options: RouteOption[] = [];
    const addedIds = new Set<string>();

    // Fastest = current/default route
    if (currentRoute) {
      options.push({
        label: 'Fastest Route',
        icon: 'flash',
        iconColor: '#E8A020',
        badgeColor: '#FFF3D0',
        route: currentRoute,
      });
      addedIds.add(currentRoute.id);
    }

    // Cheapest = lowest fare
    const withFares = routes.filter(r => r.fare && parseFare(r.fare) < Infinity && !addedIds.has(r.id));
    if (withFares.length > 0) {
      const sorted = [...withFares].sort((a, b) => parseFare(a.fare) - parseFare(b.fare));
      const cheapest = sorted[0];
      if (!currentRoute || parseFare(cheapest.fare) < parseFare(currentRoute.fare)) {
        options.push({
          label: 'Cheapest Route',
          icon: 'wallet',
          iconColor: '#22C55E',
          badgeColor: '#DCFCE7',
          route: cheapest,
        });
        addedIds.add(cheapest.id);
      }
    }

    // Least Transfers = direct route (single transport, no multi-step notes)
    const directRoutes = routes.filter(r => {
      if (addedIds.has(r.id)) return false;
      const notes = (r.notes || '').toLowerCase();
      return !notes.includes('then ride') && !notes.includes('transfer') && !notes.includes('then ') && r.transport;
    });
    if (directRoutes.length > 0) {
      options.push({
        label: 'Least Transfers',
        icon: 'git-merge',
        iconColor: '#3B82F6',
        badgeColor: '#DBEAFE',
        route: directRoutes[0],
      });
      addedIds.add(directRoutes[0].id);
    }

    // Remaining alternatives
    routes.forEach(r => {
      if (!addedIds.has(r.id)) {
        options.push({
          label: 'Alternative',
          icon: 'swap-horizontal',
          iconColor: '#8B5CF6',
          badgeColor: '#EDE9FE',
          route: r,
        });
        addedIds.add(r.id);
      }
    });

    return options;
  }, [routes, currentRoute]);

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
      <View {...panResponder.panHandlers} style={styles.handleArea}>
        <View style={styles.dragHandle} />
        <View style={styles.headerRow}>
          <Text style={styles.title}>ROUTE OPTIONS</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={24} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>
          {routes.length} route{routes.length !== 1 ? 's' : ''} available
        </Text>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {categorized.map((opt, idx) => {
          const isActive = currentRoute?.id === opt.route.id;
          return (
            <TouchableOpacity
              key={`${opt.route.id}-${idx}`}
              style={[styles.routeCard, isActive && styles.routeCardActive]}
              activeOpacity={0.7}
              onPress={() => onSelectRoute(opt.route)}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.categoryBadge, { backgroundColor: opt.badgeColor }]}>
                  <Ionicons name={opt.icon as any} size={12} color={opt.iconColor} />
                  <Text style={[styles.categoryText, { color: opt.iconColor }]}>{opt.label}</Text>
                </View>
                {isActive && (
                  <View style={styles.activePill}>
                    <Text style={styles.activePillText}>ACTIVE</Text>
                  </View>
                )}
              </View>

              <View style={styles.cardBody}>
                <View style={styles.infoRow}>
                  <Ionicons name="bus" size={15} color={COLORS.navy} />
                  <Text style={styles.transportLabel}>{opt.route.transport}</Text>
                </View>

                {opt.route.fare ? (
                  <View style={styles.infoRow}>
                    <Ionicons name="cash-outline" size={13} color={COLORS.textMuted} />
                    <Text style={styles.infoText}>{opt.route.fare}</Text>
                  </View>
                ) : null}

                {opt.route.schedule ? (
                  <View style={styles.infoRow}>
                    <Ionicons name="time-outline" size={13} color={COLORS.textMuted} />
                    <Text style={styles.infoText} numberOfLines={1}>{opt.route.schedule}</Text>
                  </View>
                ) : null}

                {opt.route.notes ? (
                  <View style={styles.infoRow}>
                    <Ionicons name="information-circle-outline" size={13} color={COLORS.textMuted} />
                    <Text style={styles.infoText} numberOfLines={2}>{opt.route.notes}</Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}

        {categorized.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={28} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>No alternative routes found.</Text>
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
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 12,
    zIndex: 25,
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
    paddingBottom: 100,
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
    gap: 12,
  },
  emptyText: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.textMuted,
  },
});
