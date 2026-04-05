import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../constants/theme';
import type { MatchedRoute } from '../services/routeSearch';
import { useTheme } from '../src/theme/ThemeContext';

type Props = {
  matched: MatchedRoute;
  isSelected: boolean;
  onPress: (id: string) => void;
  onPressStartJourney?: () => void;
  rankLabel?: string;
  metricTags?: string[];
};

const TAG_COLORS: Record<string, { backgroundColor: string; textColor: string }> = {
  Fastest: { backgroundColor: '#3B82F6', textColor: '#FFFFFF' },
  'Least Transfer': { backgroundColor: '#8B5CF6', textColor: '#FFFFFF' },
  Cheapest: { backgroundColor: '#10B981', textColor: '#FFFFFF' },
};

export default function RouteResultCard({ matched, isSelected, onPress, rankLabel, metricTags = [], onPressStartJourney }: Props) {
  const { theme, isDark } = useTheme();
  const { legs, distanceKm, estimatedMinutes } = matched;
  const tricycleExtension = matched.tricycleExtension;
  const isTransfer = legs.length > 1;
  const id = legs.map(l => l.route.properties.code).join('+');
  const formatPeso = (value: number): string => String(Math.max(0, Math.round(value)));
  const legFareParts = legs.map((leg) => formatPeso(leg.estimatedFare));
  const totalTransitFare = legs.reduce((sum, leg) => sum + Math.max(0, Math.round(leg.estimatedFare)), 0);
  const fareFormulaText = legFareParts.map((fare) => `₱${fare}`).join(' + ');
  const extensionFare = tricycleExtension ? Math.max(0, Math.round(tricycleExtension.estimatedFare)) : 0;
  const totalWithExtensionFare = totalTransitFare + extensionFare;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(10,22,40,0.06)' }, isSelected && styles.cardSelected]}
      activeOpacity={0.8}
      onPress={() => onPress(id)}
    >
      {/* Top row: tags + ETA */}
      <View style={styles.topRow}>
        <View style={styles.badgeRow}>
          {rankLabel && (
            <View style={styles.rankBadge}>
              <Ionicons name="trophy" size={10} color="#FFFFFF" />
              <Text style={styles.rankBadgeText}>{rankLabel}</Text>
            </View>
          )}
          {metricTags.map((tag) => {
            const colors = TAG_COLORS[tag] || {
              backgroundColor: 'rgba(255,255,255,0.15)',
              textColor: '#FFFFFF',
            };

            return (
              <View key={tag} style={[styles.metricTag, { backgroundColor: colors.backgroundColor }]}> 
                <Text style={[styles.metricTagText, { color: colors.textColor }]}>{tag}</Text>
              </View>
            );
          })}
        </View>
        <View style={styles.etaBadge}>
          <Ionicons name="time-outline" size={12} color={theme.textSecondary} />
          <Text style={[styles.etaText, { color: theme.textSecondary }]}>{estimatedMinutes} min</Text>
        </View>
      </View>

      {/* Routes Row */}
      <View style={styles.routeLegsRow}>
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

      {tricycleExtension ? (
        <View
          style={[
            styles.extensionWrap,
            {
              backgroundColor: isDark ? 'rgba(94, 197, 126, 0.14)' : 'rgba(94, 197, 126, 0.12)',
              borderColor: isDark ? 'rgba(94, 197, 126, 0.36)' : 'rgba(94, 197, 126, 0.45)',
            },
          ]}
        >
          <View style={styles.extensionHeader}>
            <Ionicons name="bicycle-outline" size={13} color="#2E7D32" />
            <Text style={styles.extensionTitle}>Last-mile Tricycle</Text>
          </View>

          <Text style={styles.extensionTerminalText} numberOfLines={1}>
            {tricycleExtension.terminalName}
          </Text>

          <Text style={styles.extensionMetaText}>
            Walk {tricycleExtension.walkToTerminalKm.toFixed(1)} km + Ride {tricycleExtension.rideDistanceKm.toFixed(1)} km
          </Text>
          <Text style={styles.extensionMetaText}>
            ~{tricycleExtension.estimatedMinutes} min • ₱{formatPeso(extensionFare)}
          </Text>
        </View>
      ) : null}

      <View style={styles.fareCalcRow}>
        <Text style={[styles.fareCalcLabel, { color: theme.textSecondary }]}>Transit fare</Text>
        <Text style={[styles.fareCalcValue, { color: theme.text }]}> 
          {isTransfer ? `${fareFormulaText} = ₱${formatPeso(totalTransitFare)}` : `₱${formatPeso(totalTransitFare)}`}
        </Text>
      </View>

      {tricycleExtension ? (
        <View style={styles.fareCalcRow}>
          <Text style={[styles.fareCalcLabel, { color: theme.textSecondary }]}>Tricycle extension</Text>
          <Text style={[styles.fareCalcValue, { color: theme.text }]}>₱{formatPeso(extensionFare)}</Text>
        </View>
      ) : null}

      {/* Bottom row */}
      <View style={styles.bottomRow}>
        <View style={styles.distanceWrap}>
          <Ionicons name="navigate-outline" size={13} color={theme.textSecondary} />
          <Text style={[styles.distanceText, { color: theme.textSecondary }]}>{distanceKm.toFixed(1)} km</Text>
        </View>
        <View style={styles.fareWrap}>
          {(isTransfer || tricycleExtension) && (
            <Text style={[styles.fareLabelText, { color: theme.textSecondary }]}>
              {tricycleExtension ? 'Total + Last-mile' : 'Total'}
            </Text>
          )}
          <Text style={[styles.fareText, { color: theme.text }]}>₱{formatPeso(totalWithExtensionFare)}</Text>
        </View>
      </View>

      {/* Start Journey Button for Selected Route */}
      {isSelected && onPressStartJourney && (
        <TouchableOpacity
          style={[styles.startJourneyBtn, { backgroundColor: isDark ? '#E8A020' : COLORS.primary }]}
          activeOpacity={0.9}
          onPress={() => onPressStartJourney()}
        >
          <Text style={[styles.startJourneyText, { color: isDark ? COLORS.navy : '#FFFFFF' }]}>Start Journey</Text>
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
  routeLegsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 10,
  },
  extensionWrap: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  extensionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  extensionTitle: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '700',
    color: '#2E7D32',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  extensionTerminalText: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '700',
    color: '#1D5C22',
    marginBottom: 2,
  },
  extensionMetaText: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '600',
    color: '#2E7D32',
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
  fareCalcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  fareCalcLabel: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  fareCalcValue: {
    flexShrink: 1,
    textAlign: 'right',
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '700',
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
  metricTag: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  metricTagText: {
    fontFamily: 'Inter',
    fontSize: 10,
    fontWeight: '700',
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
