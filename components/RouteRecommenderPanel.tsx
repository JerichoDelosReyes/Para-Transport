import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, TYPOGRAPHY } from "../constants/theme";
import type { MatchedRoute, RankMode } from "../services/routeSearch";
import RouteResultCard from "./RouteResultCard";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

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
  if (!visible) return null;

  return (
    <View style={styles.sheetContainer}>
      <View style={styles.sheetHeader}>
        <View style={styles.sheetHeaderRow}>
          <Text style={styles.sheetHeaderTitle}>AVAILABLE ROUTES</Text>
          <TouchableOpacity
            style={styles.clearButton}
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={22} color={COLORS.textMuted} />
          </TouchableOpacity>
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
    </View>
  );
}

const styles = StyleSheet.create({
  sheetContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.45,
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
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(10,22,40,0.06)",
  },
  sheetHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sheetHeaderTitle: {
    fontFamily: "Cubao",
    fontSize: 24,
    color: COLORS.navy,
    letterSpacing: 0.5,
  },
  clearButton: {
    padding: 4,
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
