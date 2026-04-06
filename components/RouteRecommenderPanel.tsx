import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
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

const routeSignature = (route: MatchedRoute): string =>
  route.legs.map((leg) => leg.route.properties.code).join('>');

const hasTransferWithTricycleExtension = (route: MatchedRoute): boolean =>
  route.transferCount > 0 && !!route.tricycleExtension;

const injectTransferTricycleOption = (
  allRoutes: MatchedRoute[],
  rankedRoutes: MatchedRoute[],
  limit: number,
): MatchedRoute[] => {
  if (rankedRoutes.some(hasTransferWithTricycleExtension)) return rankedRoutes;

  const candidate = [...allRoutes]
    .filter(hasTransferWithTricycleExtension)
    .sort(
      (a, b) =>
        compareLeastTransfer(a, b) ||
        compareFastest(a, b) ||
        compareCheapest(a, b),
    )[0];

  if (!candidate) return rankedRoutes;

  const candidateSig = routeSignature(candidate);
  if (rankedRoutes.some((route) => routeSignature(route) === candidateSig)) {
    return rankedRoutes;
  }

  if (rankedRoutes.length < limit) {
    return [...rankedRoutes, candidate];
  }

  const next = [...rankedRoutes];
  next[next.length - 1] = candidate;
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

  const topRankedRoutes = useMemo(() => {
    if (matchedRoutes.length <= TOP_ROUTE_LIMIT) {
      const ranked = [...matchedRoutes].sort(compareLeastTransfer);
      return injectTransferTricycleOption(matchedRoutes, ranked, TOP_ROUTE_LIMIT);
    }

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

    const ranked = [...indexed]
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
      .slice(0, TOP_ROUTE_LIMIT)
      .map((item) => item.route);

    return injectTransferTricycleOption(matchedRoutes, ranked, TOP_ROUTE_LIMIT);
  }, [matchedRoutes]);

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

  const renderRouteCard = useCallback(
    ({ item, index }: { item: MatchedRoute; index: number }) => {
      const id = item.legs.map((leg: any) => leg.route.properties.code).join('+');

      return (
        <RouteResultCard
          matched={item}
          isSelected={selectedRoute === id}
          rankLabel={`Top ${index + 1}`}
          metricTags={getMetricTags(item)}
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
    (item: MatchedRoute) => item.legs.map((leg: any) => leg.route.properties.code).join('+'),
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
      title={`ROUTES - ${(routeTypeLabel || 'Transit').toUpperCase()}`}
    >
      <FlatList
        data={topRankedRoutes}
        keyExtractor={keyExtractor}
        renderItem={renderRouteCard}
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
    paddingBottom: 330 // Increased more to ensure no cut-off
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
