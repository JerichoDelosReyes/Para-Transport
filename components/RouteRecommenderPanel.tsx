import React, { useRef, useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Animated, PanResponder } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, TYPOGRAPHY } from "../constants/theme";
import type { MatchedRoute, RankMode } from "../services/routeSearch";
import RouteResultCard from "./RouteResultCard";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

// Pre-compute expansion snap states
const FULL_HEIGHT = SCREEN_HEIGHT * 0.8;
const HALF_HEIGHT = SCREEN_HEIGHT * 0.45;

type Props = {
  visible: boolean;
  matchedRoutes: MatchedRoute[];
  rankedRoutes: MatchedRoute[];
  rankTab: RankMode;
  setRankTab: React.Dispatch<React.SetStateAction<RankMode>>;
  selectedRoute: string | null;
  setSelectedRoute: (id: string | null) => void;
  destinationName?: string;
  onClose: () => void;
};

const RANK_TABS = [
  { key: "easiest", label: "Easiest" },
  { key: "fastest", label: "Fastest" },
  { key: "cheapest", label: "Cheapest" },
] as const;

export default function RouteRecommenderPanel({
  visible,
  matchedRoutes,
  rankedRoutes,
  rankTab,
  setRankTab,
  selectedRoute,
  setSelectedRoute,
  onClose,
  destinationName
}: Props) {
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

  return (
    <Animated.View 
      style={[
        styles.sheetContainer, 
        { transform: [{ translateY: panY }] }
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <View style={styles.sheetHeader} {...panResponder.panHandlers}>
        <TouchableOpacity style={styles.dragHandleWrap} onPress={toggleExpand} activeOpacity={0.9}>
          <View style={styles.dragHandle} />
        </TouchableOpacity>
        <View style={styles.sheetHeaderRow}>
          <Text style={styles.sheetHeaderTitle}>AVAILABLE ROUTES</Text>
        </View>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={styles.sheetContent}
        bounces={false}
      >
        <View style={styles.cardList}>
          {destinationName ? (
            <Text style={styles.routeResultSubtitle}>
              {matchedRoutes.length} route{matchedRoutes.length !== 1 ? "s" : ""} to {destinationName}
            </Text>
          ) : null}

          {matchedRoutes.length > 1 && (
            <View style={styles.rankTabsRow}>
              {RANK_TABS.map((tab) => (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.rankTab, rankTab === tab.key && styles.rankTabActive]}
                  activeOpacity={0.8}
                  onPress={() => setRankTab(tab.key as RankMode)}
                >
                  <Text style={[styles.rankTabText, rankTab === tab.key && styles.rankTabTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {matchedRoutes.length > 0 ? (
            rankedRoutes.map((matched, index) => {
              const id = matched.legs.map((l: any) => l.route.properties.code).join("+");
              const badgeLabel = index === 0 && rankedRoutes.length > 1
                ? RANK_TABS.find(t => t.key === rankTab)?.label
                : undefined;
              return (
                <RouteResultCard
                  key={id}
                  matched={matched}
                  isSelected={selectedRoute === id}
                  badgeLabel={badgeLabel}
                  onPress={(pressedId: string) => {
                    setSelectedRoute(selectedRoute === pressedId ? null : pressedId);
                  }}
                />
              );
            })
          ) : (
            <View style={styles.emptyResultCard}>
              <Ionicons name="bus-outline" size={36} color={COLORS.textMuted} />
              <Text style={styles.emptyResultTitle}>No transit routes found</Text>
              <Text style={styles.emptyResultText}>
                No jeepney routes pass near both your location and this destination.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
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
    justifyContent: "space-between",
    alignItems: "center",
  },
  dragHandleWrap: {
    alignItems: 'center',
    paddingBottom: 12,
    paddingTop: 8,
    width: '100%',
  },
  dragHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(10,22,40,0.2)",
  },
  sheetHeaderTitle: {
    fontFamily: "Cubao",
    fontSize: 24,
    color: COLORS.navy,
    letterSpacing: 0.5,
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 10,
  },
  routeResultSubtitle: {
    fontFamily: "Inter-Medium",
    fontSize: TYPOGRAPHY.body,
    color: COLORS.textMuted,
    marginBottom: 16,
  },
  cardList: {
    gap: 12,
  },
  rankTabsRow: {
    flexDirection: "row",
    backgroundColor: "rgba(10,22,40,0.04)",
    borderRadius: RADIUS.pill,
    padding: 4,
    marginBottom: 16,
  },
  rankTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: RADIUS.pill,
  },
  rankTabActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  rankTabText: {
    fontFamily: "Inter-SemiBold",
    fontSize: TYPOGRAPHY.caption,
    color: COLORS.textMuted,
  },
  rankTabTextActive: {
    color: COLORS.navy,
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
