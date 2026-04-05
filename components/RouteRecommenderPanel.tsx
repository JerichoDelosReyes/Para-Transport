import React, { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Dimensions, Animated, PanResponder } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, TYPOGRAPHY } from "../constants/theme";
import type { MatchedRoute } from "../services/routeSearch";
import RouteResultCard from "./RouteResultCard";
import { useTheme } from '../src/theme/ThemeContext';

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

// Pre-compute expansion snap states
const FULL_HEIGHT = SCREEN_HEIGHT * 0.8;
const HALF_HEIGHT = SCREEN_HEIGHT * 0.45;
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

export default function RouteRecommenderPanel({
  visible,
  matchedRoutes,
  selectedRoute,
  setSelectedRoute,
  onClose,
  destinationName,
  routeTypeLabel,
  onStartJourney,
}: Props) {
  const { theme, isDark } = useTheme();
  // Start off-screen at 0 (bound safely behind bottom edge)
  const panY = useRef(new Animated.Value(0)).current; 
  const [isExpanded, setIsExpanded] = useState(false);

  // 1. Enter / Exit animations
  useEffect(() => {
    if (visible) {
      setIsExpanded(false);
      Animated.spring(panY, {
        toValue: -HALF_HEIGHT,
        tension: 60,
        friction: 12,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(panY, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, panY]);

  const toggleExpand = () => {
    const nextY = isExpanded ? -HALF_HEIGHT : -FULL_HEIGHT;
    Animated.spring(panY, {
      toValue: nextY,
      tension: 60,
      friction: 12,
      useNativeDriver: true,
    }).start(() => setIsExpanded(!isExpanded));
  };

  const handleDismissSpring = () => {
    Animated.timing(panY, {
      toValue: 0, // Slide totally off-screen
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      onClose(); // Triggers state wipe upstream
    });
  };

  // 2. Gesture Handling
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gestureState) => Math.abs(gestureState.dy) > 10,
        onPanResponderGrant: () => {
          panY.extractOffset();
        },
        onPanResponderMove: Animated.event([null, { dy: panY }], { useNativeDriver: false }),
        onPanResponderRelease: (_, gestureState) => {
          panY.flattenOffset();
          
          if (gestureState.dy > 80) {
            handleDismissSpring();
          } else if (gestureState.dy < -50) {
            Animated.spring(panY, {
              toValue: -FULL_HEIGHT,
              tension: 60,
              friction: 12,
              useNativeDriver: true,
            }).start(() => setIsExpanded(true));
          } else {
             // Revert snap to closest interval
            Animated.spring(panY, {
              toValue: isExpanded ? -FULL_HEIGHT : -HALF_HEIGHT,
              tension: 60,
              friction: 12,
              useNativeDriver: true,
            }).start();
          }
        },
      }),
    [isExpanded, panY]
  );

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
      const id = item.legs.map((l: any) => l.route.properties.code).join("+");

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
    [selectedRoute, setSelectedRoute, onStartJourney, getMetricTags]
  );

  const keyExtractor = useMemo(
    () => (item: MatchedRoute) => item.legs.map((l: any) => l.route.properties.code).join("+"),
    []
  );

  const shownCount = topRankedRoutes.length;
  const totalCount = matchedRoutes.length;

  const listHeader = useMemo(
    () => null,
    []
  );

  const emptyList = useMemo(
    () => (
      <View style={[styles.emptyResultCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(10,22,40,0.02)', borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(10,22,40,0.05)' }]}>
        <Ionicons name="bus-outline" size={36} color={theme.textSecondary} />
        <Text style={[styles.emptyResultTitle, { color: theme.text }]}>No {routeTypeLabel || 'transit'} routes found</Text>
        <Text style={[styles.emptyResultText, { color: theme.textSecondary }]}>
          No {routeTypeLabel ? routeTypeLabel.toLowerCase() : 'transit'} routes pass near both your location and this destination.
        </Text>
      </View>
    ),
    [routeTypeLabel]
  );

  return (
    <Animated.View 
      style={[
        styles.sheetContainer, 
        { transform: [{ translateY: panY }], backgroundColor: theme.cardBackground }
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <View style={[styles.sheetHeader, { backgroundColor: theme.cardBackground, borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(10,22,40,0.06)' }]} {...panResponder.panHandlers}>
        <TouchableOpacity style={styles.dragHandleWrap} onPress={toggleExpand} activeOpacity={0.9}>
          <View style={[styles.dragHandle, { backgroundColor: isDark ? '#E8A020' : COLORS.primary }]} />
        </TouchableOpacity>
        <View style={styles.sheetHeaderRow}>
          <Text style={[styles.sheetHeaderTitle, { color: theme.text }]}>ROUTES</Text>
        </View>
      </View>

      <FlatList
        data={topRankedRoutes}
        keyExtractor={keyExtractor}
        renderItem={renderRouteCard}
        showsVerticalScrollIndicator={false}
        bounces={false}
        contentContainerStyle={styles.sheetContent}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyList}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListFooterComponent={() => <View style={{ height: 40 }} />}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheetContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -FULL_HEIGHT,
    height: FULL_HEIGHT,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    paddingTop: 8,
    zIndex: 100,
  },
  sheetHeader: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(10,22,40,0.06)",
    backgroundColor: "transparent", 
  },
  sheetHeaderRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  dragHandleWrap: {
    alignItems: 'center',
    paddingBottom: 12,
    paddingTop: 8,
    width: '100%',
  },
  dragHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  sheetHeaderTitle: {
    fontFamily: "Cubao",
    fontSize: 24,
    color: COLORS.navy,
    letterSpacing: 0.5,
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 100,
  },
  routeResultSubtitle: {
    fontFamily: "Inter-Medium",
    fontSize: TYPOGRAPHY.body,
    color: COLORS.textMuted,
    marginBottom: 16,
  },
  emptyResultCard: {
    alignItems: "center",
    padding: 32,
    backgroundColor: "rgba(10,22,40,0.02)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(10,22,40,0.05)",
  },
  emptyResultTitle: {
    fontFamily: "Inter-SemiBold",
    fontSize: TYPOGRAPHY.body,
    color: COLORS.navy,
    marginTop: 12,
    marginBottom: 8,
  },
  emptyResultText: {
    fontFamily: "Inter",
    fontSize: TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
});
