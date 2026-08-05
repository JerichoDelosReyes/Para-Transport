import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY } from '../constants/theme';
import type { MatchedRoute } from '../services/routeSearch';
import RouteResultCard from './RouteResultCard';
import BottomSheet from './BottomSheet';
import { useTheme } from '../src/theme/ThemeContext';

type Props = {
  visible: boolean;
  matchedRoutes: MatchedRoute[];
  selectedRoute: string | null;
  setSelectedRoute: (id: string | null) => void;
  destinationName?: string;
  routeTypeLabel?: string;
  onClose: () => void;
  onStartJourney?: (id: string) => void;
};

type SortMode = 'best' | 'fastest' | 'least_transfer' | 'cheapest' | null;

const TOP_ROUTE_LIMIT = 5;

const compareLeastTransfer = (a: MatchedRoute, b: MatchedRoute): number =>
  a.transferCount - b.transferCount ||
  a.estimatedMinutes - b.estimatedMinutes ||
  a.estimatedFare - b.estimatedFare;

const compareFastest = (a: MatchedRoute, b: MatchedRoute): number =>
  a.estimatedMinutes - b.estimatedMinutes ||
  a.transferCount - b.transferCount ||
  a.estimatedFare - b.estimatedFare;

const compareCheapest = (a: MatchedRoute, b: MatchedRoute): number =>
  a.estimatedFare - b.estimatedFare ||
  a.transferCount - b.transferCount ||
  a.estimatedMinutes - b.estimatedMinutes;

const routeId = (route: MatchedRoute): string =>
  route.legs.map((leg) => leg.route.properties.code).join('+');

type RouteGroup = {
  primary: MatchedRoute;
  alternates: MatchedRoute[];
};

const ROUTE_GROUP_POINT_TOLERANCE_METERS = 220;
const ROUTE_GROUP_DISTANCE_TOLERANCE_RATIO = 0.2;
const ROUTE_GROUP_MIN_DISTANCE_TOLERANCE_KM = 0.4;
const METERS_PER_DEGREE = 111_320;

const approxMetersBetween = (
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number => {
  const latRad = ((a.latitude + b.latitude) / 2) * (Math.PI / 180);
  const dLat = (a.latitude - b.latitude) * METERS_PER_DEGREE;
  const dLng = (a.longitude - b.longitude) * METERS_PER_DEGREE * Math.cos(latRad);
  return Math.sqrt(dLat * dLat + dLng * dLng);
};

const isSameItinerary = (a: MatchedRoute, b: MatchedRoute): boolean => {
  if (a.legs.length !== b.legs.length) return false;
  for (let i = 0; i < a.legs.length; i++) {
    const legA = a.legs[i];
    const legB = b.legs[i];
    if (approxMetersBetween(legA.boardingPoint, legB.boardingPoint) > ROUTE_GROUP_POINT_TOLERANCE_METERS) return false;
    if (approxMetersBetween(legA.alightingPoint, legB.alightingPoint) > ROUTE_GROUP_POINT_TOLERANCE_METERS) return false;
  }
  const distanceTolerance = Math.max(
    ROUTE_GROUP_MIN_DISTANCE_TOLERANCE_KM,
    a.distanceKm * ROUTE_GROUP_DISTANCE_TOLERANCE_RATIO,
  );
  return Math.abs(a.distanceKm - b.distanceKm) <= distanceTolerance;
};

const groupRoutesByItinerary = (routes: MatchedRoute[]): RouteGroup[] => {
  const groups: RouteGroup[] = [];
  for (const route of routes) {
    const existing = groups.find((g) => isSameItinerary(g.primary, route));
    if (existing) existing.alternates.push(route);
    else groups.push({ primary: route, alternates: [] });
  }
  return groups;
};

const totalFareForInsight = (route: MatchedRoute): number => {
  const ext = route.tricycleExtension
    ? Math.max(0, Math.round(route.tricycleExtension.estimatedFare || 0))
    : 0;
  return Math.max(0, Math.round(route.estimatedFare)) + ext;
};

const routeSignature = (route: MatchedRoute): string =>
  route.legs.map((leg) => leg.route.properties.code).join('>');

const hasTransferWithTricycleExtension = (route: MatchedRoute): boolean =>
  route.transferCount > 0 && !!route.tricycleExtension;

const injectTransferTricycleGroupOption = (
  allRoutes: MatchedRoute[],
  rankedGroups: RouteGroup[],
  limit: number,
): RouteGroup[] => {
  if (rankedGroups.some((g) => hasTransferWithTricycleExtension(g.primary))) return rankedGroups;
  const candidate = [...allRoutes]
    .filter(hasTransferWithTricycleExtension)
    .sort((a, b) => compareLeastTransfer(a, b) || compareFastest(a, b) || compareCheapest(a, b))[0];
  if (!candidate) return rankedGroups;
  const sig = routeSignature(candidate);
  const alreadyPresent = rankedGroups.some(
    (g) => routeSignature(g.primary) === sig || g.alternates.some((alt) => routeSignature(alt) === sig),
  );
  if (alreadyPresent) return rankedGroups;
  const candidateGroup: RouteGroup = { primary: candidate, alternates: [] };
  if (rankedGroups.length < limit) return [...rankedGroups, candidateGroup];
  const next = [...rankedGroups];
  next[next.length - 1] = candidateGroup;
  return next;
};

const transferLabel = (count: number): string =>
  count === 0 ? 'No transfer' : `${count} transfer${count === 1 ? '' : 's'}`;

// ─── Sort filter config ────────────────────────────────────────────────────────
const SORT_FILTERS: { key: SortMode; label: string; icon: string }[] = [
  { key: 'best',           label: 'Best',     icon: 'star'            },
  { key: 'fastest',        label: 'Fastest',  icon: 'flash'           },
  { key: 'least_transfer', label: 'Transfer', icon: 'swap-horizontal' },
  { key: 'cheapest',       label: 'Cheapest', icon: 'cash'            },
];

const FILTER_COLORS: Record<SortMode, { active: string; text: string }> = {
  best:           { active: '#E8A020', text: '#FFFFFF' },
  fastest:        { active: '#3B82F6', text: '#FFFFFF' },
  least_transfer: { active: '#8B5CF6', text: '#FFFFFF' },
  cheapest:       { active: '#10B981', text: '#FFFFFF' },
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function RouteRecommenderPanel({
  visible,
  matchedRoutes,
  selectedRoute,
  setSelectedRoute,
  onClose,
  routeTypeLabel,
  onStartJourney,
}: Props) {
  const { theme, isDark } = useTheme();
  const [sortMode, setSortMode] = useState<SortMode>(null);
  const [showInsight, setShowInsight] = useState(false);

  // ── Metric tags per option ──────────────────────────────────────────────
  const metricBaselines = useMemo(() => {
    if (matchedRoutes.length === 0) return null;
    return {
      fastestMinutes: Math.min(...matchedRoutes.map((route) => route.estimatedMinutes)),
      leastTransfers: Math.min(...matchedRoutes.map((route) => route.transferCount)),
      cheapestFare: Math.min(...matchedRoutes.map((route) => route.estimatedFare)),
    };
  }, [matchedRoutes]);

  const getMetricTags = useCallback(
    (route: MatchedRoute): string[] => {
      if (!metricBaselines) return [];
      const tags: string[] = [];
      if (route.estimatedMinutes === metricBaselines.fastestMinutes) tags.push('Fastest');
      if (route.transferCount === metricBaselines.leastTransfers) tags.push('Least Transfer');
      if (Math.abs(route.estimatedFare - metricBaselines.cheapestFare) < 0.001) tags.push('Cheapest');
      return tags;
    },
    [metricBaselines],
  );

  // ── Best (composite) ranking ──────────────────────────────────────────────
  const bestRankedGroups = useMemo<RouteGroup[]>(() => {
    if (matchedRoutes.length === 0) return [];
    let rankedAll: MatchedRoute[];

    if (matchedRoutes.length <= TOP_ROUTE_LIMIT) {
      rankedAll = [...matchedRoutes].sort(compareLeastTransfer);
    } else {
      const indexed = matchedRoutes.map((route, index) => ({ route, index }));
      const scores = new Map<number, number>();
      const applyRankScores = (cmp: (a: MatchedRoute, b: MatchedRoute) => number, w: number) => {
        [...indexed].sort((a, b) => cmp(a.route, b.route) || a.index - b.index)
          .forEach(({ index: idx }, rank) => scores.set(idx, (scores.get(idx) || 0) + rank * w));
      };
      applyRankScores(compareLeastTransfer, 1);
      applyRankScores(compareFastest, 1);
      applyRankScores(compareCheapest, 1);

      rankedAll = [...indexed]
        .sort((a, b) => {
          const diff = (scores.get(a.index) || 0) - (scores.get(b.index) || 0);
          if (diff !== 0) return diff;
          return (
            compareLeastTransfer(a.route, b.route) ||
            compareFastest(a.route, b.route) ||
            compareCheapest(a.route, b.route) ||
            a.index - b.index
          );
        })
        .map((i) => i.route);
    }

    const topGroups = groupRoutesByItinerary(rankedAll).slice(0, TOP_ROUTE_LIMIT);
    return injectTransferTricycleGroupOption(matchedRoutes, topGroups, TOP_ROUTE_LIMIT);
  }, [matchedRoutes]);

  // ── Filtered/Sorted list based on active category button ──────────────────
  const displayedGroups = useMemo<RouteGroup[]>(() => {
    if (matchedRoutes.length === 0) return [];

    // If no category is toggled (null), show all routes with best option first
    if (sortMode === null) return bestRankedGroups;

    let filtered: MatchedRoute[] = [];

    if (sortMode === 'best') {
      // Best category: must have 2 or 3 category tags
      filtered = matchedRoutes.filter((r) => getMetricTags(r).length >= 2);
    } else if (sortMode === 'fastest') {
      filtered = matchedRoutes.filter((r) => getMetricTags(r).includes('Fastest'));
      filtered.sort(compareFastest);
    } else if (sortMode === 'least_transfer') {
      filtered = matchedRoutes.filter((r) => getMetricTags(r).includes('Least Transfer'));
      filtered.sort(compareLeastTransfer);
    } else if (sortMode === 'cheapest') {
      filtered = matchedRoutes.filter((r) => getMetricTags(r).includes('Cheapest'));
      filtered.sort(compareCheapest);
    }

    // If category has no routes, fallback to best option
    if (filtered.length === 0) {
      return bestRankedGroups;
    }

    return groupRoutesByItinerary(filtered).slice(0, TOP_ROUTE_LIMIT);
  }, [sortMode, matchedRoutes, bestRankedGroups, getMetricTags]);

  // ── Insight text ─────────────────────────────────────────────────────────
  const topRankedRoutes = useMemo(() => bestRankedGroups.map((g) => g.primary), [bestRankedGroups]);

  const routeInsightText = useMemo(() => {
    if (topRankedRoutes.length === 0) return null;
    const rec = topRankedRoutes[0];
    const fastestMin = Math.min(...topRankedRoutes.map((r) => r.estimatedMinutes));
    const cheapestFare = Math.min(...topRankedRoutes.map(totalFareForInsight));
    const leastXfers = Math.min(...topRankedRoutes.map((r) => r.transferCount));
    const recFare = totalFareForInsight(rec);
    const tags: string[] = [];
    if (rec.estimatedMinutes === fastestMin) tags.push('fastest');
    if (recFare === cheapestFare) tags.push('cheapest');
    if (rec.transferCount === leastXfers) tags.push('least transfers');
    const reasonText =
      tags.length === 0 ? 'balanced time, fare, and transfers' :
      tags.length === 1 ? `${tags[0]} profile` :
      tags.length === 2 ? `${tags[0]} and ${tags[1]} profile` :
      'fastest, cheapest, and least-transfer profile';
    if (topRankedRoutes.length === 1) {
      return `Option 1 has a ${reasonText}: ~${rec.estimatedMinutes} min, ${rec.distanceKm.toFixed(1)} km, ₱${recFare}, ${transferLabel(rec.transferCount).toLowerCase()}.`;
    }
    return `Option 1 is recommended with a ${reasonText}: ~${rec.estimatedMinutes} min, ${rec.distanceKm.toFixed(1)} km, ₱${recFare}, ${transferLabel(rec.transferCount).toLowerCase()}. Fastest ~${fastestMin} min · Cheapest ₱${cheapestFare} · ${transferLabel(leastXfers)}.`;
  }, [topRankedRoutes]);


  // ── Render helpers ───────────────────────────────────────────────────────
  const renderRouteCard = useCallback(
    ({ item }: { item: RouteGroup }) => {
      const matched = item.primary;
      const id = routeId(matched);
      return (
        <RouteResultCard
          matched={matched}
          alternates={item.alternates}
          isSelected={selectedRoute === id}
          metricTags={getMetricTags(matched)}
          onPress={(pressedId: string) => {
            setSelectedRoute(selectedRoute === pressedId ? null : pressedId);
          }}
          onPressStartJourney={() => onStartJourney?.(id)}
        />
      );
    },
    [selectedRoute, setSelectedRoute, onStartJourney, getMetricTags],
  );

  const keyExtractor = useCallback((item: RouteGroup) => routeId(item.primary), []);

  const emptyList = useMemo(
    () => (
      <View
        style={[
          styles.emptyResultCard,
          {
            backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(10,22,40,0.02)',
            borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(10,22,40,0.05)',
          },
        ]}
      >
        <Ionicons name="bus-outline" size={36} color={theme.textSecondary} />
        <Text style={[styles.emptyResultTitle, { color: theme.text }]}>
          No {routeTypeLabel || 'transit'} routes found
        </Text>
        <Text style={[styles.emptyResultText, { color: theme.textSecondary }]}>
          No {routeTypeLabel ? routeTypeLabel.toLowerCase() : 'transit'} routes pass near both your location and this destination.
        </Text>
      </View>
    ),
    [isDark, theme.textSecondary, theme.text, routeTypeLabel],
  );

  // ── Header: sort bar + optional insight card ──────────────────────────────
  const listHeader = useMemo(() => (
    <View style={styles.headerWrap}>

      {/* Sort filter row — all 4 buttons, full width, no scroll */}
      <View style={styles.filterRow}>
        {SORT_FILTERS.map(({ key, label, icon }) => {
          const isActive = sortMode === key;
          const colors = FILTER_COLORS[key];
          const inactiveText = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(10,22,40,0.45)';
          return (
            <TouchableOpacity
              key={key}
              activeOpacity={0.75}
              onPress={() => setSortMode((prev) => (prev === key ? null : key))}
              style={[
                styles.filterBtn,
                {
                  backgroundColor: isActive
                    ? colors.active
                    : isDark ? 'rgba(255,255,255,0.07)' : 'rgba(10,22,40,0.06)',
                  borderColor: isActive ? colors.active : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(10,22,40,0.1)',
                  shadowColor: isActive ? colors.active : 'transparent',
                  shadowOpacity: isActive ? 0.45 : 0,
                  shadowRadius: isActive ? 8 : 0,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: isActive ? 5 : 0,
                },
              ]}
            >
              <Ionicons
                name={icon as any}
                size={12}
                color={isActive ? colors.text : inactiveText}
              />
              <Text
                style={[
                  styles.filterBtnText,
                  {
                    color: isActive ? colors.text : inactiveText,
                    fontWeight: isActive ? '800' : '600',
                  },
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Insights */}
      {routeInsightText ? (
        showInsight ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setShowInsight(false)}
            style={[
              styles.insightCard,
              {
                backgroundColor: isDark ? 'rgba(245,197,24,0.12)' : '#FFF6CC',
                borderColor: '#E8A020',
              },
            ]}
          >
            <View style={[styles.insightIconWrap, { backgroundColor: isDark ? 'rgba(232,160,32,0.24)' : 'rgba(232,160,32,0.18)' }]}>
              <Ionicons name="bulb-outline" size={15} color={isDark ? '#FFD970' : '#9A6B00'} />
            </View>
            <Text style={[styles.insightText, { color: isDark ? '#FFE8A3' : '#6D4C00' }]}>
              {routeInsightText}
            </Text>
            <Ionicons name="close" size={15} color={isDark ? '#FFE8A3' : '#9A6B00'} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => setShowInsight(true)}
            style={[
              styles.insightButton,
              {
                backgroundColor: isDark ? 'rgba(245,197,24,0.12)' : '#FFF6CC',
                borderColor: '#E8A020',
              },
            ]}
          >
            <View style={[styles.insightIconWrap, { backgroundColor: isDark ? 'rgba(232,160,32,0.24)' : 'rgba(232,160,32,0.18)' }]}>
              <Ionicons name="bulb-outline" size={15} color={isDark ? '#FFD970' : '#9A6B00'} />
            </View>
            <Text style={[styles.insightButtonText, { color: isDark ? '#FFE8A3' : '#6D4C00' }]}>
              Insights
            </Text>
            <Ionicons name="chevron-down-outline" size={13} color={isDark ? '#FFE8A3' : '#9A6B00'} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
        )
      ) : null}

    </View>
  ), [sortMode, isDark, showInsight, routeInsightText]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="ROUTES">
      <FlatList
        data={displayedGroups}
        keyExtractor={keyExtractor}
        renderItem={renderRouteCard}
        ListHeaderComponent={listHeader}
        showsVerticalScrollIndicator={false}
        bounces={false}
        contentContainerStyle={styles.sheetContent}
        ListEmptyComponent={emptyList}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListFooterComponent={() => <View style={{ height: 40 }} />}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 350,
  },
  // ── Header ──────────────────────────────────────────────────────────────
  headerWrap: {
    gap: 10,
    marginBottom: 14,
  },
  // ── Filter row ──────────────────────────────────────────────────────────
  filterRow: {
    flexDirection: 'row',
    gap: 7,
  },
  filterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 22,
    borderWidth: 1.5,
    minWidth: 0,
  },
  filterBtnText: {
    fontFamily: 'Inter',
    fontSize: 11,
    letterSpacing: 0.1,
    flexShrink: 1,
  },
  // ── Insight ─────────────────────────────────────────────────────────────
  insightButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  insightCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  insightIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  insightButtonText: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '700',
  },
  insightText: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  // ── Empty state ─────────────────────────────────────────────────────────
  emptyResultCard: {
    alignItems: 'center',
    padding: 32,
    borderRadius: 16,
    borderWidth: 1,
  },
  emptyResultTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: TYPOGRAPHY.body,
    marginTop: 12,
    marginBottom: 8,
  },
  emptyResultText: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.caption,
    textAlign: 'center',
    lineHeight: 20,
  },
});
