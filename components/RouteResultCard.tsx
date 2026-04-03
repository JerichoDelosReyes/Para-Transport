import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../constants/theme';
import type { MatchedRoute } from '../services/routeSearch';

type Props = {
  matched: MatchedRoute;
  isSelected: boolean;
  onPress: (id: string) => void;
  onPressStartJourney?: () => void;
  badgeLabel?: string;
};

export default function RouteResultCard({ matched, isSelected, onPress, badgeLabel, onPressStartJourney }: Props) {
  const { legs, distanceKm, estimatedMinutes } = matched;
  const isTransfer = legs.length > 1;
  const id = legs.map(l => l.route.properties.code).join('+');
  const formatPeso = (value: number): string => String(Math.max(0, Math.round(value)));
  const totalTransitFare = legs.reduce((sum, leg) => sum + Math.max(0, Math.round(leg.estimatedFare)), 0);

  return (
    <TouchableOpacity
      style={[styles.card, isSelected && styles.cardSelected]}
      activeOpacity={0.8}
      onPress={() => onPress(id)}
    >
      {/* Top row: badges + ETA */}
      <View style={styles.topRow}>
        <View style={styles.badgeRow}>
          {badgeLabel && (
            <View style={styles.rankBadge}>
              <Ionicons name="trophy" size={10} color="#FFFFFF" />
              <Text style={styles.rankBadgeText}>{badgeLabel}</Text>
            </View>
          )}
          {legs.map((leg, i) => (
            <React.Fragment key={leg.route.properties.code}>
              {i > 0 && (
                <Ionicons name="walk-outline" size={14} color={COLORS.textMuted} style={{ marginHorizontal: 2 }} />
              )}
              <View style={[styles.codeBadge, i > 0 && { backgroundColor: '#4CAF50' }]}>
                <Text style={styles.codeText}>{leg.route.properties.name || leg.route.properties.code}</Text>
              </View>
            </React.Fragment>
          ))}
          {isTransfer && (
            <View style={styles.transferBadge}>
              <Ionicons name="swap-horizontal" size={11} color="#FF9800" />
              <Text style={styles.transferText}>Transfer</Text>
            </View>
          )}
        </View>
        <View style={styles.etaBadge}>
          <Ionicons name="time-outline" size={12} color={COLORS.textMuted} />
          <Text style={styles.etaText}>{estimatedMinutes} min</Text>
        </View>
      </View>

      {/* Route name(s) */}
      {legs.map((leg, i) => (
        <Text key={i} style={styles.routeName} numberOfLines={1}>
          {i > 0 ? '↳ ' : ''}{leg.route.properties.name}
        </Text>
      ))}

      {/* Via stops */}
      {legs.length === 1 && (() => {
        const { fromLabel, toLabel } = legs[0].route.properties;
        if (fromLabel && toLabel) {
          return (
            <Text style={styles.viaText} numberOfLines={1}>
              {fromLabel} → {toLabel}
            </Text>
          );
        } else if (fromLabel || toLabel) {
          return (
            <Text style={styles.viaText} numberOfLines={1}>
              {fromLabel || toLabel}
            </Text>
          );
        }
        return null;
      })()}

      {/* Per-leg fare breakdown for transfers */}
      {isTransfer && (
        <View style={styles.fareBreakdown}>
          {legs.map((leg, i) => (
            <Text key={i} style={styles.fareBreakdownText}>
              {leg.route.properties.code}: ₱{formatPeso(leg.estimatedFare)} ({leg.distanceKm.toFixed(1)} km)
            </Text>
          ))}
        </View>
      )}

      {/* Bottom row */}
      <View style={styles.bottomRow}>
        <View style={styles.distanceWrap}>
          <Ionicons name="navigate-outline" size={13} color={COLORS.textMuted} />
          <Text style={styles.distanceText}>{distanceKm.toFixed(1)} km</Text>
        </View>
        <View style={styles.fareWrap}>
          {isTransfer && <Text style={styles.fareLabelText}>Total</Text>}
          <Text style={styles.fareText}>₱{formatPeso(totalTransitFare)}</Text>
        </View>
      </View>

      {/* Start Journey Button for Selected Route */}
      {isSelected && onPressStartJourney && (
        <TouchableOpacity
          style={styles.startJourneyBtn}
          activeOpacity={0.9}
          onPress={() => onPressStartJourney()}
        >
          <Text style={styles.startJourneyText}>Start Journey</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.card,
    padding: SPACING.cardPadding,
    borderWidth: 1,
    borderColor: 'rgba(10,22,40,0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardSelected: {
    borderColor: '#E8A020',
    borderWidth: 2,
    backgroundColor: 'rgba(232,160,32,0.04)',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    flexWrap: 'wrap',
    gap: 4,
  },
  codeBadge: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  codeText: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  etaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  etaText: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  routeName: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.body,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 2,
  },
  viaText: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginBottom: 10,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  distanceWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  distanceText: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  fareText: {
    fontFamily: 'Inter',
    fontSize: 22,
    fontWeight: '800',
    color: '#E8A020',
  },
  fareWrap: {
    alignItems: 'flex-end',
  },
  fareLabelText: {
    fontFamily: 'Inter',
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: -2,
  },
  fareBreakdown: {
    marginBottom: 8,
    gap: 2,
  },
  fareBreakdownText: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  transferBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,152,0,0.12)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  transferText: {
    fontFamily: 'Inter',
    fontSize: 10,
    fontWeight: '700',
    color: '#FF9800',
  },
  rankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#E8A020',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  rankBadgeText: {
    fontFamily: 'Inter',
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  startJourneyBtn: {
    marginTop: 16,
    height: 56,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 6,
  },
  startJourneyText: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.navy,
  },
});
