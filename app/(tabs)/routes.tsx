import { useState, useMemo, useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View, TouchableOpacity, InteractionManager, Alert, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '../../constants/theme';
import { ProfileButton } from '../../components/ProfileButton';
import { useJeepneyRoutes, JeepneyRoute } from '../../hooks/useJeepneyRoutes';
import { useStore } from '../../store/useStore';
import { ROUTE_COLORS, ROUTE_LABELS } from '../../constants/routeVisuals';
import { getRouteDisplayRef, MAP_ENABLED_ROUTE_CODES } from '../../constants/routeCatalog';

const FILTER_MODES = ['All', 'Jeepney', 'Tricycle', 'Bus'] as const;
const MODE_TO_ROUTE_TYPE: Record<(typeof FILTER_MODES)[number], string | null> = {
  All: null,
  Jeepney: 'jeepney',
  Tricycle: 'tricycle',
  Bus: 'bus',
};

const TYPE_ORDER = ['tricycle', 'jeepney', 'bus'];
const VEHICLE_ICONS: Record<string, any> = {
  jeepney: require('../../assets/icons/jeepney-icon.png'),
  bus: require('../../assets/icons/bus-icon.png'),
  tricycle: require('../../assets/icons/tricycle-icon.png'),
};

function normalizeGpxRoute(r: JeepneyRoute) {
  return {
    id: r.properties.code,
    type: r.properties.type,
    color: (ROUTE_COLORS as Record<string, string>)[r.properties.type] || '#FF6B35',
    ref: getRouteDisplayRef(r.properties.code, r.properties.code),
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
  const bottomSpace = insets.bottom > 0 ? insets.bottom * 0.6 : 24;
  const bottomPadding = 48 + bottomSpace + 16;
  const [activeTab, setActiveTab] = useState<'transit' | 'history'>('history');
  const [selectedMode, setSelectedMode] = useState<(typeof FILTER_MODES)[number]>('All');
  const [isReady, setIsReady] = useState(false);
  const setSelectedTransitRoute = useStore((state) => state.setSelectedTransitRoute);
  const user = useStore((state) => state.user);
  const setPendingRouteSearch = useStore((state) => state.setPendingRouteSearch);
  const saveRoute = useStore((state) => state.saveRoute);
  const removeSavedRoute = useStore((state) => state.removeSavedRoute);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setIsReady(true);
    });
    return () => task.cancel();
  }, []);

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

  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const type of TYPE_ORDER) {
      groups[type] = [];
    }
    for (const route of filteredVerifiedRoutes) {
      if (groups[route.type]) {
        groups[route.type].push(route);
      }
    }
    return groups;
  }, [filteredVerifiedRoutes]);

  const totalTransitCount = filteredVerifiedRoutes.length;

  const handleTransitRoutePress = (route: any) => {
    const isMapEnabled = MAP_ENABLED_ROUTE_CODES.includes(route.id as any);
    if (!isMapEnabled) {
      Alert.alert('UI Only', 'This route is visible in Routes, but map implementation is not enabled yet.');
      return;
    }
    setSelectedTransitRoute(route);
    router.navigate('/(tabs)');
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Routes</Text>
        <ProfileButton />
      </View>

      <View style={styles.tabSwitcher}>
        <TouchableOpacity
          style={[styles.switchTab, activeTab === 'history' && styles.switchTabActive]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.switchTabText, activeTab === 'history' && styles.switchTabTextActive]}>HISTORY</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.switchTab, activeTab === 'transit' && styles.switchTabActive]}
          onPress={() => setActiveTab('transit')}
        >
          <Text style={[styles.switchTabText, activeTab === 'transit' && styles.switchTabTextActive]}>TRANSIT</Text>
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

            {(!isReady || gpxLoading) ? (
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
                            {VEHICLE_ICONS[route.type] ? (
                              <Image source={VEHICLE_ICONS[route.type]} style={[styles.routeIconImage, { tintColor: route.color }]} />
                            ) : (
                              <Ionicons name="bus" size={18} color={route.color} />
                            )}
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
        ) : user.commute_history && user.commute_history.length > 0 ? (
          <View style={{ paddingTop: 0 }}>
            <View style={{ gap: SPACING.cardGap }}>
              {user.commute_history.map((item: any, index: number) => {
                const targetName = `${item.origin?.name || 'Current Location'} to ${item.destination?.name || 'Unknown'}`;
                const isSaved = user.saved_routes?.some((r: any) => 
                  r.name === targetName || (r.legs && r.legs[0]?.fromObj?.lat === item.origin?.lat && r.legs[0]?.toObj?.lat === item.destination?.lat && item.destination?.lat)
                );
                return (
                  <View key={item.id || index} style={styles.historyCard}>
                    <View style={styles.historyCardTop}>
                      <Text style={styles.historyRouteName} numberOfLines={1}>
                        {targetName}
                      </Text>
                      <TouchableOpacity
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        onPress={() => {
                          if (!isSaved) {
                            saveRoute({
                              id: Date.now(),
                              name: targetName,
                              legs: [{ mode: 'Custom Route', from: item.origin?.name || 'Current Location', to: item.destination?.name || 'Unknown', fromObj: item.origin || null, toObj: item.destination }],
                              total_fare: item.fare || 0,
                            });
                            Alert.alert('Saved', 'Route has been added to your Saved page.');
                          } else {
                            const routeToRemove = user.saved_routes.find((r: any) => 
                              r.name === targetName || (r.legs && r.legs[0]?.fromObj?.lat === item.origin?.lat && r.legs[0]?.toObj?.lat === item.destination?.lat && item.destination?.lat)
                            );
                            if (routeToRemove) {
                               removeSavedRoute(routeToRemove.id);
                            }
                          }
                        }}
                      >
                        <Ionicons name={isSaved ? "bookmark" : "bookmark-outline"} size={18} color={isSaved ? COLORS.primary : COLORS.textMuted} />
                      </TouchableOpacity>
                    </View>
                    <View>
                      <Text style={styles.historyLegSummary}>Recent Search</Text>
                      <Text style={[styles.historyLegSummary, { marginTop: 2, fontSize: 10, color: '#9CA3AF' }]}>
                        {item.timestamp ? (new Date(item.timestamp).toLocaleDateString() + ' at ' + new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : 'Recent'}
                      </Text>
                    </View>
                    <View style={[styles.historyCardBottom, { justifyContent: 'flex-end' }]}>
                      <TouchableOpacity 
                        style={styles.historyGhostButton} 
                        activeOpacity={0.9} 
                        onPress={() => {
                          setPendingRouteSearch({ origin: item.origin || null, destination: item.destination });
                          router.navigate('/(tabs)');
                        }}
                      >
                        <Text style={styles.historyGhostButtonText}>View</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
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
  routeIconImage: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
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
  historyCard: {
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  historyCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyRouteName: {
    flex: 1,
    marginRight: 8,
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: 15,
    color: COLORS.textStrong,
  },
  historyLegSummary: {
    marginTop: 4,
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textMuted,
  },
  historyCardBottom: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  historyGhostButton: {
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.navy,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: COLORS.card,
  },
  historyGhostButtonText: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.navy,
  },
});