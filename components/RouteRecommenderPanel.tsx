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

const TOP_ROUTE_LIMIT = 5;

const compareLeastTransfer = (a: MatchedRoute, b: MatchedRoute): number => {
  return (
    a.transferCount - b.transferCount ||
    a.estimatedMinutes - b.estimatedMinutes ||
    a.estimatedFare - b.estimatedFare
  );
};

const compareFastest = (a: MatchedRoute, b: MatchedRoute): number => {
  return (
    a.estimatedMinutes - b.estimatedMinutes ||
    a.transferCount - b.transferCount ||
    a.estimatedFare - b.estimatedFare
  );
};

const compareCheapest = (a: MatchedRoute, b: MatchedRoute): number => {
  return (
    a.estimatedFare - b.estimatedFare ||
    a.transferCount - b.transferCount ||
    a.estimatedMinutes - b.estimatedMinutes
  );
};

const routeId = (route: MatchedRoute): string =>
  route.legs.map((leg) => leg.route.properties.code).join('+');

type RouteGroup = {
  primary: MatchedRoute;
  alternates: MatchedRoute[];
};

// Tolerance for treating two matched routes as "the same physical trip" even
// though they're served by differently-named/coded jeepney lines that happen
// to run the same corridor (e.g. several lines all pass Dasma -> Trece).
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
    if (approxMetersBetween(legA.boardingPoint, legB.boardingPoint) > ROUTE_GROUP_POINT_TOLERANCE_METERS) {
      return false;
    }
    if (approxMetersBetween(legA.alightingPoint, legB.alightingPoint) > ROUTE_GROUP_POINT_TOLERANCE_METERS) {
      return false;
    }
  }

  const distanceTolerance = Math.max(
    ROUTE_GROUP_MIN_DISTANCE_TOLERANCE_KM,
    a.distanceKm * ROUTE_GROUP_DISTANCE_TOLERANCE_RATIO,
  );
  if (Math.abs(a.distanceKm - b.distanceKm) > distanceTolerance) return false;

  return true;
};

// Collapses routes that cover the same physical path (same boarding/alighting
// points per leg) but are served by differently-tagged jeepney lines into a
// single group, so the UI can show one card with the alternates tucked away.
const groupRoutesByItinerary = (routes: MatchedRoute[]): RouteGroup[] => {
  const groups: RouteGroup[] = [];

  for (const route of routes) {
    const existing = groups.find((group) => isSameItinerary(group.primary, route));
    if (existing) {
      existing.alternates.push(route);
    } else {
      groups.push({ primary: route, alternates: [] });
    }
  }

  return groups;
};

const transferLabel = (count: number): string =>
  count === 0 ? 'No transfer' : `${count} transfer${count === 1 ? '' : 's'}`;

const totalFareForInsight = (route: MatchedRoute): number => {
  const extensionFare = route.tricycleExtension
    ? Math.max(0, Math.round(route.tricycleExtension.estimatedFare || 0))
    : 0;
  return Math.max(0, Math.round(route.estimatedFare)) + extensionFare;
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
  if (rankedGroups.some((group) => hasTransferWithTricycleExtension(group.primary))) return rankedGroups;

  const candidate = [...allRoutes]
    .filter(hasTransferWithTricycleExtension)
    .sort(
      (a, b) =>
        compareLeastTransfer(a, b) ||
        compareFastest(a, b) ||
        compareCheapest(a, b),
    )[0];

  if (!candidate) return rankedGroups;

  const candidateSig = routeSignature(candidate);
  const alreadyPresent = rankedGroups.some(
    (group) =>
      routeSignature(group.primary) === candidateSig ||
      group.alternates.some((alt) => routeSignature(alt) === candidateSig),
  );
  if (alreadyPresent) return rankedGroups;

  const candidateGroup: RouteGroup = { primary: candidate, alternates: [] };

  if (rankedGroups.length < limit) {
    return [...rankedGroups, candidateGroup];
  }

  const next = [...rankedGroups];
  next[next.length - 1] = candidateGroup;
  return next;
};
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
  const [showInsight, setShowInsight] = useState(false);

  const topRankedGroups = useMemo<RouteGroup[]>(() => {
    if (matchedRoutes.length === 0) return [];

    let rankedAll: MatchedRoute[];

    if (matchedRoutes.length <= TOP_ROUTE_LIMIT) {
      rankedAll = [...matchedRoutes].sort(compareLeastTransfer);
    } else {
      const indexed = matchedRoutes.map((route, index) => ({ route, index }));
      const compositeScores = new Map<number, number>();

      const applyRankScores = (
        comparator: (a: MatchedRoute, b: MatchedRoute) => number,
        weight: number,
      ) => {
        const ordered = [...indexed].sort((a, b) => comparator(a.route, b.route) || a.index - b.index);
        ordered.forEach((item, rankIndex) => {
          compositeScores.set(item.index, (compositeScores.get(item.index) || 0) + rankIndex * weight);
        });
      };

      applyRankScores(compareLeastTransfer, 1);
      applyRankScores(compareFastest, 1);
      applyRankScores(compareCheapest, 1);

      rankedAll = [...indexed]
        .sort((a, b) => {
          const scoreDiff = (compositeScores.get(a.index) || 0) - (compositeScores.get(b.index) || 0);
          if (scoreDiff !== 0) return scoreDiff;

          return (
            compareLeastTransfer(a.route, b.route) ||
            compareFastest(a.route, b.route) ||
            compareCheapest(a.route, b.route) ||
            a.index - b.index
          );
        })
        .map((item) => item.route);
    }

    const topGroups = groupRoutesByItinerary(rankedAll).slice(0, TOP_ROUTE_LIMIT);
    return injectTransferTricycleGroupOption(matchedRoutes, topGroups, TOP_ROUTE_LIMIT);
  }, [matchedRoutes]);

  const topRankedRoutes = useMemo(
    () => topRankedGroups.map((group) => group.primary),
    [topRankedGroups],
  );

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

  const routeInsightText = useMemo(() => {
    if (topRankedRoutes.length === 0) return null;

    const recommendedRoute = topRankedRoutes[0];
    const recommendedIndex = 1;
    const fastestMinutes = Math.min(...topRankedRoutes.map((route) => route.estimatedMinutes));
    const cheapestFare = Math.min(...topRankedRoutes.map(totalFareForInsight));
    const leastTransfers = Math.min(...topRankedRoutes.map((route) => route.transferCount));
    const recommendedFare = totalFareForInsight(recommendedRoute);
    const transferText = transferLabel(recommendedRoute.transferCount).toLowerCase();

    const recommendedTags: string[] = [];
    if (recommendedRoute.estimatedMinutes === fastestMinutes) recommendedTags.push('fastest');
    if (recommendedFare === cheapestFare) recommendedTags.push('cheapest');
    if (recommendedRoute.transferCount === leastTransfers) recommendedTags.push('least transfers');

    const reasonText =
      recommendedTags.length === 0
        ? 'balanced time, fare, and transfers'
        : recommendedTags.length === 1
        ? `${recommendedTags[0]} profile`
        : recommendedTags.length === 2
        ? `${recommendedTags[0]} and ${recommendedTags[1]} profile`
        : 'fastest, cheapest, and least-transfer profile';

    if (topRankedRoutes.length === 1) {
      return `Most recommended route (Option ${recommendedIndex}) has a ${reasonText}: ~${recommendedRoute.estimatedMinutes} min, ${recommendedRoute.distanceKm.toFixed(1)} km, around ₱${recommendedFare}, and ${transferText}.`;
    }

    return `Across ${topRankedRoutes.length} suggested routes, Option ${recommendedIndex} is the most recommended with a ${reasonText}: ~${recommendedRoute.estimatedMinutes} min, ${recommendedRoute.distanceKm.toFixed(1)} km, around ₱${recommendedFare}, and ${transferText}. Fastest in this list is ~${fastestMinutes} min, cheapest is around ₱${cheapestFare}, and the least-transfer option has ${transferLabel(leastTransfers).toLowerCase()}.`;
  }, [topRankedRoutes]);

  const insightHeader = useMemo(() => {
    if (!routeInsightText) return null;

    if (!showInsight) {
      return (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setShowInsight(true)}
          style={[
            styles.insightButton,
            {
              backgroundColor: isDark ? 'rgba(245,197,24,0.14)' : '#FFF6CC',
              borderColor: '#E8A020',
            },
          ]}
        >
          <View
            style={[
              styles.insightIconWrap,
              {
                backgroundColor: isDark ? 'rgba(232,160,32,0.24)' : 'rgba(232,160,32,0.18)',
              },
            ]}
          >
            <Ionicons name="bulb-outline" size={16} color={isDark ? '#FFD970' : '#9A6B00'} />
          </View>
          <Text style={[styles.insightButtonText, { color: isDark ? '#FFE8A3' : '#6D4C00' }]}>Insights</Text>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setShowInsight(false)}
        style={[
          styles.insightCard,
          {
            backgroundColor: isDark ? 'rgba(245,197,24,0.14)' : '#FFF6CC',
            borderColor: '#E8A020',
          },
        ]}
      >
        <View
          style={[
            styles.insightIconWrap,
            {
              backgroundColor: isDark ? 'rgba(232,160,32,0.24)' : 'rgba(232,160,32,0.18)',
            },
          ]}
        >
          <Ionicons name="bulb-outline" size={16} color={isDark ? '#FFD970' : '#9A6B00'} />
        </View>
        <Text style={[styles.insightText, { color: isDark ? '#FFE8A3' : '#6D4C00' }]}>{routeInsightText}</Text>
        <Ionicons name="close" size={16} color={isDark ? '#FFE8A3' : '#6D4C00'} />
      </TouchableOpacity>
    );
  }, [routeInsightText, isDark, showInsight]);

  const renderRouteCard = useCallback(
    ({ item, index }: { item: RouteGroup; index: number }) => {
      const matched = item.primary;
      const id = routeId(matched);

      return (
        <RouteResultCard
          matched={matched}
          alternates={item.alternates}
          isSelected={selectedRoute === id}
          rankLabel={`Option ${index + 1}`}
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

  const keyExtractor = useCallback(
    (item: RouteGroup) => routeId(item.primary),
    [],
  );

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
        <Text style={[styles.emptyResultTitle, { color: theme.text }]}>No {routeTypeLabel || 'transit'} routes found</Text>
        <Text style={[styles.emptyResultText, { color: theme.textSecondary }]}>No {routeTypeLabel ? routeTypeLabel.toLowerCase() : 'transit'} routes pass near both your location and this destination.</Text>
      </View>
    ),
    [isDark, theme.textSecondary, theme.text, routeTypeLabel],
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="ROUTES"
    >
      <FlatList
        data={topRankedGroups}
        keyExtractor={keyExtractor}
        renderItem={renderRouteCard}
        ListHeaderComponent={insightHeader}
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
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 350 // Reduced to standard padding
  },
  insightCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  insightButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    borderWidth: 2,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
  },
  insightButtonText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    fontWeight: '700',
  },
  insightIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  insightText: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  emptyResultCard: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: 'rgba(10,22,40,0.02)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(10,22,40,0.05)',
  },
  emptyResultTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: TYPOGRAPHY.body,
    color: COLORS.navy,
    marginTop: 12,
    marginBottom: 8,
  },
  emptyResultText: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
