import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, TYPOGRAPHY } from "../constants/theme";
import type { MatchedRoute, RankMode } from "../services/routeSearch";
import RouteResultCard from "./RouteResultCard";
import BottomSheet from './BottomSheet';

type Props = {
  visible: boolean;
  matchedRoutes: MatchedRoute[];
  rankedRoutes: MatchedRoute[];
  rankTab: RankMode;
  setRankTab: React.Dispatch<React.SetStateAction<RankMode>>;
  selectedRoute: string | null;
  setSelectedRoute: (id: string | null) => void;
  destinationName?: string;
  routeTypeLabel?: string;
  onClose: () => void;
  onStartJourney?: (id: string) => void;
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
  destinationName,
  routeTypeLabel,
  onStartJourney,
}: Props) {
  const renderRouteCard = useMemo(
    () => ({ item, index }: { item: MatchedRoute; index: number }) => {
      const id = item.legs.map((l: any) => l.route.properties.code).join("+");
      const badgeLabel =
        index === 0 && rankedRoutes.length > 1
          ? RANK_TABS.find((t) => t.key === rankTab)?.label
          : undefined;

      return (
        <RouteResultCard
          matched={item}
          isSelected={selectedRoute === id}
          badgeLabel={badgeLabel}
          onPress={(pressedId: string) => {
            setSelectedRoute(selectedRoute === pressedId ? null : pressedId);
          }}
          onPressStartJourney={() => onStartJourney?.(id)}
        />
      );
    },
    [rankTab, rankedRoutes.length, selectedRoute, setSelectedRoute, onStartJourney]
  );

  const keyExtractor = useMemo(
    () => (item: MatchedRoute) => item.legs.map((l: any) => l.route.properties.code).join("+"),
    []
  );

  const shownCount = rankedRoutes.length;
  const totalCount = matchedRoutes.length;
  const routeSubtitle =
    totalCount > shownCount
      ? `Top ${shownCount} of ${totalCount} routes${destinationName ? ` to ${destinationName}` : ''}`
      : `${shownCount} route${shownCount !== 1 ? 's' : ''}${destinationName ? ` to ${destinationName}` : ''}`;

  const listHeader = useMemo(
    () => (
      <>
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
      </>
    ),
    [destinationName, matchedRoutes.length, rankTab, routeSubtitle, setRankTab, totalCount]
  );

  const emptyList = useMemo(
    () => (
      <View style={styles.emptyResultCard}>
        <Ionicons name="bus-outline" size={36} color={COLORS.textMuted} />
        <Text style={styles.emptyResultTitle}>No {routeTypeLabel || 'transit'} routes found</Text>
        <Text style={styles.emptyResultText}>
          No {routeTypeLabel ? routeTypeLabel.toLowerCase() : 'transit'} routes pass near both your location and this destination.
        </Text>
      </View>
    ),
    [routeTypeLabel]
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={`ROUTES - ${(routeTypeLabel || 'Transit').toUpperCase()}`}
    >
      <FlatList
        data={rankedRoutes}
        keyExtractor={keyExtractor}
        renderItem={renderRouteCard}
        showsVerticalScrollIndicator={false}
        bounces={false}
        contentContainerStyle={styles.sheetContent}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyList}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListFooterComponent={() => <View style={{ height: 120 }} />}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 250,
  },
  routeResultSubtitle: {
    fontFamily: "Inter-Medium",
    fontSize: TYPOGRAPHY.body,
    color: COLORS.textMuted,
    marginBottom: 16,
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
