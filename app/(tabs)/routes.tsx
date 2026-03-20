import { useState, useMemo, useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View, TouchableOpacity, InteractionManager } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '../../constants/theme';
import { ProfileButton } from '../../components/ProfileButton';
import { useTransitData } from '../../hooks/useTransitData';
import { useJeepneyRoutes, JeepneyRoute } from '../../hooks/useJeepneyRoutes';
import { useStore } from '../../store/useStore';
import { ROUTE_COLORS, ROUTE_LABELS } from '../../services/parseRoutes';

const FILTER_MODES = ['All', 'Jeepney', 'Bus', 'UV Express'] as const;
const MODE_TO_ROUTE_TYPE: Record<(typeof FILTER_MODES)[number], string | null> = {
  All: null,
  Jeepney: 'jeepney',
  Bus: 'bus',
  'UV Express': 'share_taxi',
};

const TYPE_ORDER = ['bus', 'jeepney', 'share_taxi'];
const TYPE_ICONS: Record<string, string> = {
  bus: 'bus',
  jeepney: 'car',
  share_taxi: 'car-sport',
};

function normalizeGpxRoute(r: JeepneyRoute) {
  return {
    id: r.properties.code,
    type: r.properties.type,
    color: (ROUTE_COLORS as Record<string, string>)[r.properties.type] || '#FF6B35',
    ref: r.properties.code,
    name: r.properties.name,
    from: r.stops[0]?.label || '',
    to: r.stops[r.stops.length - 1]?.label || '',
    operator: r.properties.operator || '',
    coordinates: r.coordinates,
    stops: r.stops.map((s, idx) => ({
      id: `${r.properties.code}-stop-${idx}`,
      coordinate: s.coordinate,
      name: s.label,
      operator: r.properties.operator || '',
    })),
    verified: true,
    fare: r.properties.fare,
  };
}

export default function RoutesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomPadding = 60 + 36 + insets.bottom + 16;
  const [activeTab, setActiveTab] = useState<'transit' | 'history'>('transit');
  const [selectedMode, setSelectedMode] = useState<(typeof FILTER_MODES)[number]>('All');
  const [isReady, setIsReady] = useState(false);
  const setSelectedTransitRoute = useStore((state) => state.setSelectedTransitRoute);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setIsReady(true);
    });
    return () => task.cancel();
  }, []);

  const { routes: transitRoutes, loading } = useTransitData();
  const { routes: gpxRoutes, loading: gpxLoading } = useJeepneyRoutes();

  const verifiedRoutes = useMemo(
    () => gpxRoutes.map(normalizeGpxRoute),
    [gpxRoutes]
  );

  const filteredVerifiedRoutes = useMemo(() => {
    const targetType = MODE_TO_ROUTE_TYPE[selectedMode];
    if (!targetType) return verifiedRoutes;
    return verifiedRoutes.filter((r) => r.type === targetType);
  }, [verifiedRoutes, selectedMode]);

  const filteredRoutes = useMemo(() => {
    const targetType = MODE_TO_ROUTE_TYPE[selectedMode];
    if (!targetType) return transitRoutes as any[];
    return (transitRoutes as any[]).filter((route) => route.type === targetType);
  }, [transitRoutes, selectedMode]);

  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const type of TYPE_ORDER) {
      groups[type] = [];
    }
    for (const route of filteredRoutes) {
      if (groups[route.type]) {
        groups[route.type].push(route);
      }
    }
    return groups;
  }, [filteredRoutes]);

  const totalTransitCount = filteredRoutes.length + filteredVerifiedRoutes.length;

  const handleTransitRoutePress = (route: any) => {
    setSelectedTransitRoute(route);
    router.push('/(tabs)');
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Routes</Text>
        <ProfileButton />
      </View>

      <View style={styles.tabSwitcher}>
        <TouchableOpacity
          style={[styles.switchTab, activeTab === 'transit' && styles.switchTabActive]}
          onPress={() => setActiveTab('transit')}
        >
          <Text style={[styles.switchTabText, activeTab === 'transit' && styles.switchTabTextActive]}>TRANSIT</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.switchTab, activeTab === 'history' && styles.switchTabActive]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.switchTabText, activeTab === 'history' && styles.switchTabTextActive]}>HISTORY</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: COLORS.background }}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'transit' ? (
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                TRANSIT ROUTES {totalTransitCount > 0 ? `(${totalTransitCount})` : ''}
              </Text>
            </View>

            <View style={styles.quickActionsContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modeScroll}>
                {FILTER_MODES.map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.modePill, selectedMode === mode && styles.modePillActive]}
                    onPress={() => setSelectedMode(mode)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.modePillText, selectedMode === mode && styles.modePillTextActive]}>{mode}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {(!isReady || loading || gpxLoading) ? (
              <View style={styles.skeletonContainer}>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <View key={i} style={styles.skeletonCard} />
                ))}
              </View>
            ) : totalTransitCount === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No transit routes found.</Text>
              </View>
            ) : (
              <>
                {filteredVerifiedRoutes.length > 0 && (
                  <View style={styles.group}>
                    <View style={styles.groupHeader}>
                      <View style={[styles.groupDot, { backgroundColor: '#22C55E' }]} />
                      <Text style={styles.groupTitle}>Verified Routes ({filteredVerifiedRoutes.length})</Text>
                    </View>
                    {filteredVerifiedRoutes.map((route) => (
                      <TouchableOpacity
                        key={route.id}
                        style={styles.routeCard}
                        activeOpacity={0.85}
                        onPress={() => handleTransitRoutePress(route)}
                      >
                        <View style={[styles.routeIcon, { backgroundColor: route.color + '20' }]}>
                          <Ionicons name={(TYPE_ICONS[route.type] || 'car') as any} size={18} color={route.color} />
                        </View>
                        <View style={styles.routeInfo}>
                          <View style={styles.routeNameRow}>
                            <Text style={styles.routeName} numberOfLines={1}>{route.name}</Text>
                            <View style={styles.verifiedBadge}>
                              <Ionicons name="checkmark-circle" size={12} color="#22C55E" />
                              <Text style={styles.verifiedBadgeText}>Verified</Text>
                            </View>
                          </View>
                          {(route.from || route.to) ? (
                            <Text style={styles.routeMeta} numberOfLines={1}>
                              {route.from}{route.from && route.to ? ' -> ' : ''}{route.to}
                            </Text>
                          ) : null}
                          {route.fare ? (
                            <Text style={styles.routeOperator} numberOfLines={1}>
                              Base fare: P{route.fare}
                            </Text>
                          ) : null}
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {TYPE_ORDER.map((type) => {
                  const group = grouped[type];
                  if (!group || group.length === 0) return null;
                  return (
                    <View key={type} style={styles.group}>
                      <View style={styles.groupHeader}>
                        <View style={[styles.groupDot, { backgroundColor: ROUTE_COLORS[type as keyof typeof ROUTE_COLORS] }]} />
                        <Text style={styles.groupTitle}>
                          {ROUTE_LABELS[type as keyof typeof ROUTE_LABELS]} ({group.length})
                        </Text>
                      </View>
                      {group.map((route) => (
                        <TouchableOpacity
                          key={route.id}
                          style={styles.routeCard}
                          activeOpacity={0.85}
                          onPress={() => handleTransitRoutePress(route)}
                        >
                          <View style={[styles.routeIcon, { backgroundColor: route.color + '20' }]}>
                            <Ionicons name={TYPE_ICONS[route.type] as any} size={18} color={route.color} />
                          </View>
                          <View style={styles.routeInfo}>
                            <Text style={styles.routeName} numberOfLines={1}>
                              {route.ref ? `[${route.ref}] ` : ''}{route.name}
                            </Text>
                            {(route.from || route.to) ? (
                              <Text style={styles.routeMeta} numberOfLines={1}>
                                {route.from}{route.from && route.to ? ' -> ' : ''}{route.to}
                              </Text>
                            ) : null}
                            {route.operator ? (
                              <Text style={styles.routeOperator} numberOfLines={1}>
                                {route.operator}
                              </Text>
                            ) : null}
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  );
                })}
              </>
            )}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No history yet.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F5C518',
  },
  header: {
    backgroundColor: '#F5C518',
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
    color: '#0A1628',
  },
  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#F5C518',
    paddingHorizontal: SPACING.screenX,
    paddingBottom: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  switchTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  switchTabActive: {
    borderBottomColor: '#0A1628',
  },
  switchTabText: {
    fontFamily: 'Cubao',
    fontSize: 18,
    color: 'rgba(10,22,40,0.5)',
  },
  switchTabTextActive: {
    color: '#0A1628',
  },
  content: {
    padding: SPACING.screenX,
    paddingTop: 24,
  },
  sectionHeader: {
    marginBottom: 20,
    alignItems: 'center',
  },
  sectionTitle: {
    fontFamily: 'Cubao',
    fontSize: 20,
    color: COLORS.navy,
    letterSpacing: 0.5,
  },
  quickActionsContainer: {
    marginBottom: 14,
  },
  modeScroll: {
    gap: 8,
    paddingBottom: 6,
  },
  modePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(10,22,40,0.12)',
  },
  modePillActive: {
    backgroundColor: '#0A1628',
    borderColor: '#0A1628',
  },
  modePillText: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.navy,
  },
  modePillTextActive: {
    color: '#FFFFFF',
  },
  group: {
    marginBottom: 20,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  groupDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  groupTitle: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.label,
    fontWeight: '700',
    color: COLORS.navy,
  },
  routeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.card,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(10,22,40,0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  routeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  routeInfo: {
    flex: 1,
  },
  routeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  routeName: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.navy,
    flexShrink: 1,
  },
  routeMeta: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  routeOperator: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: COLORS.textLabel,
    marginTop: 1,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#DCFCE7',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  verifiedBadgeText: {
    fontFamily: 'Inter',
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
  },
  emptyTitle: {
    fontFamily: 'Inter',
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.navy,
    marginTop: 20,
  },
  skeletonContainer: {
    paddingTop: 10,
  },
  skeletonCard: {
    height: 70,
    backgroundColor: '#E2E8F0',
    borderRadius: RADIUS.card,
    marginBottom: 10,
    opacity: 0.6,
  },
});