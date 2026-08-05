import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../constants/theme';
import type { MatchedRoute } from '../services/routeSearch';
import type { JeepneyRoute } from '../types/routes';
import { useTheme } from '../src/theme/ThemeContext';

type Props = {
  matched: MatchedRoute;
  isSelected: boolean;
  onPress: (id: string) => void;
  onPressStartJourney?: () => void;
  metricTags?: string[];
  /** Other matched routes covering the same physical path (same stops), served by differently-tagged jeepneys. */
  alternates?: MatchedRoute[];
};

const TAG_COLORS: Record<string, { backgroundColor: string; textColor: string }> = {
  Fastest: { backgroundColor: 'rgba(59,130,246,0.14)', textColor: '#3B82F6' },
  'Least Transfer': { backgroundColor: 'rgba(139,92,246,0.14)', textColor: '#8B5CF6' },
  Cheapest: { backgroundColor: 'rgba(16,185,129,0.14)', textColor: '#10B981' },
};

// Jeepney line names are stored as "Origin -> Destination" (e.g. "Jeepney: Dasmarinas -> PITX").
// Riders mainly need to know where a leg drops them off, so show just the destination on the chip.
const ARROW_PATTERN = /-{1,2}>|→/;

// Some routes have no display name at all, so we fall back to their raw machine code
// (e.g. "JEEPNEY-ROUTE-SM-MOLINO"). Strip the redundant "jeepney-route" prefix (we already
// show a jeepney icon) and turn the remaining hyphens into a readable title-cased name.
const humanizeCode = (code: string): string => {
  const withoutPrefix = code.replace(/^jeepney[-_\s]*route[-_\s]*/i, '').trim();
  const base = withoutPrefix || code;
  return base
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const getVehicleIcon = (route: JeepneyRoute) => {
  const type = (route.properties.type || '').toLowerCase();
  if (type.includes('bus')) return require('../assets/icons/bus-icon.png');
  return require('../assets/icons/jeepney-icon.png');
};

const legDestinationLabel = (route: JeepneyRoute): string => {
  const props = route.properties;
  if (props.toLabel && props.toLabel.trim()) return props.toLabel.trim();

  const name = (props.name || '').trim();
  const arrowMatch = name.match(ARROW_PATTERN);
  if (arrowMatch && arrowMatch.index !== undefined) {
    const destination = name.slice(arrowMatch.index + arrowMatch[0].length).trim();
    if (destination) return destination;
  }
  if (name) return name;

  return humanizeCode((props.code || '').trim());
};

export default function RouteResultCard({ matched, isSelected, onPress, metricTags = [], onPressStartJourney, alternates = [] }: Props) {
  const { theme, isDark } = useTheme();
  const [showAlternates, setShowAlternates] = useState(false);
  const { legs, distanceKm, estimatedMinutes } = matched;
  const hasAlternates = alternates.length > 0;
  const tricycleExtension = matched.tricycleExtension;
  const isTransfer = legs.length > 1;
  const id = legs.map(l => l.route.properties.code).join('+');
  const formatPeso = (value: number): string => String(Math.max(0, Math.round(value)));
  const legFareParts = legs.map((leg) => formatPeso(leg.estimatedFare));
  const totalTransitFare = legs.reduce((sum, leg) => sum + Math.max(0, Math.round(leg.estimatedFare)), 0);
  const fareFormulaText = legFareParts.map((fare) => `₱${fare}`).join(' + ');
  const extensionFare = tricycleExtension ? Math.max(0, Math.round(tricycleExtension.estimatedFare)) : 0;
  const totalWithExtensionFare = totalTransitFare + extensionFare;
  const hasTerminalWalk = !!tricycleExtension && tricycleExtension.walkToTerminalKm > 0.05;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: isSelected
            ? isDark
              ? 'rgba(232,160,32,0.1)' // Just a bit stronger overlay for selected dark
              : 'rgba(232,160,32,0.06)'
            : theme.cardBackground,
          borderColor: isSelected
            ? '#E8A020'
            : isDark
            ? 'rgba(255,255,255,0.06)'
            : 'rgba(10,22,40,0.06)',
          borderWidth: isSelected ? 2 : 1,
        },
      ]}
      activeOpacity={0.8}
      onPress={() => onPress(id)}
    >
      {/* Top row: tags + ETA */}
      <View style={styles.topRow}>
        <View style={styles.badgeRow}>
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
              <View style={styles.walkIconWrap}>
                <Ionicons name="walk-outline" size={13} color={isDark ? '#FFFFFF' : COLORS.navy} />
              </View>
            )}
            <View style={[styles.codeBadge, i > 0 && { backgroundColor: '#4CAF50' }]}>
              <Image source={getVehicleIcon(leg.route)} style={styles.jeepneyIcon} resizeMode="contain" />
              <Text style={styles.codeText}>{legDestinationLabel(leg.route)}</Text>
            </View>
          </React.Fragment>
        ))}
        {isTransfer && (
          <View style={styles.transferBadge}>
            <Ionicons name="swap-horizontal" size={11} color="#FF9800" />
            <Text style={styles.transferText}>Transfer</Text>
          </View>
        )}
        {hasAlternates && (
          <TouchableOpacity
            style={styles.moreButton}
            activeOpacity={0.7}
            onPress={() => setShowAlternates((prev) => !prev)}
          >
            <Ionicons
              name={showAlternates ? 'close' : 'ellipsis-vertical'}
              size={14}
              color={showAlternates ? '#EF4444' : theme.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>

      {hasAlternates && showAlternates ? (
        <View
          style={[
            styles.alternatesWrap,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(10,22,40,0.03)',
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(10,22,40,0.08)',
            },
          ]}
        >
          <Text style={[styles.alternatesLabel, { color: theme.textSecondary }]}>
            Also runs this route ({alternates.length})
          </Text>
          {alternates.map((alt) => (
            <View key={alt.legs.map((leg) => leg.route.properties.code).join('+')} style={styles.alternateRow}>
              {alt.legs.map((leg, i) => (
                <React.Fragment key={leg.route.properties.code}>
                  {i > 0 && (
                    <View style={styles.walkIconWrap}>
                      <Ionicons name="walk-outline" size={12} color={isDark ? '#FFFFFF' : COLORS.navy} />
                    </View>
                  )}
                  <View style={[styles.codeBadge, styles.altCodeBadge, i > 0 && { backgroundColor: '#4CAF50' }]}>
                    <Image source={getVehicleIcon(leg.route)} style={styles.jeepneyIcon} resizeMode="contain" />
                    <Text style={styles.codeText}>{legDestinationLabel(leg.route)}</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
          ))}
        </View>
      ) : null}

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
            <Ionicons name="bicycle-outline" size={13} color={isDark ? '#81C784' : '#2E7D32'} />
            <Text style={[styles.extensionTitle, isDark && { color: '#81C784' }]}>Last-mile Tricycle</Text>
          </View>

          <Text style={[styles.extensionTerminalText, isDark && { color: '#A5D6A7' }]} numberOfLines={1}>
            {tricycleExtension.terminalName}
          </Text>

          <Text style={[styles.extensionMetaText, isDark && { color: '#81C784' }]}>
            {hasTerminalWalk
              ? `Walk ${(tricycleExtension.walkToTerminalKm || 0).toFixed(1)} km + Ride ${(tricycleExtension.rideDistanceKm || 0).toFixed(1)} km`
              : `Drop-off at terminal • Ride ${(tricycleExtension.rideDistanceKm || 0).toFixed(1)} km`}
          </Text>
          <Text style={[styles.extensionMetaText, isDark && { color: '#81C784' }]}>
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

      {/* Action Buttons for Selected Route */}
      {isSelected && (
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
          {onPressStartJourney && (
            <TouchableOpacity
              style={[styles.startJourneyBtn, { flex: 1, backgroundColor: isDark ? '#E8A020' : COLORS.primary }]}
              activeOpacity={0.9}
              onPress={() => onPressStartJourney()}
            >
              <Text style={[styles.startJourneyText, { color: isDark ? COLORS.navy : '#FFFFFF' }]}>Start Journey</Text>
            </TouchableOpacity>
          )}

        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  jeepneyIcon: {
    width: 13,
    height: 13,
  },
  walkIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(128,128,128,0.22)',
  },
  moreButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(128,128,128,0.14)',
  },
  alternatesWrap: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
    gap: 6,
  },
  alternatesLabel: {
    fontFamily: 'Inter',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  alternateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  altCodeBadge: {
    opacity: 0.75,
  },
  codeText: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    flexShrink: 1,
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
