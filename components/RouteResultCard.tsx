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
  destinationName?: string;
};

const TAG_COLORS: Record<string, { backgroundColor: string; textColor: string }> = {
  Fastest: { backgroundColor: 'rgba(59,130,246,0.14)', textColor: '#3B82F6' },
  'Least Transfer': { backgroundColor: 'rgba(139,92,246,0.14)', textColor: '#8B5CF6' },
  Cheapest: { backgroundColor: 'rgba(16,185,129,0.14)', textColor: '#10B981' },
};

const ARROW_PATTERN = /-{1,2}>|→/;

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

const getVehicleTypeLabel = (route: JeepneyRoute): string => {
  const type = (route.properties.type || '').toLowerCase();
  if (type.includes('bus')) return 'Bus';
  if (type.includes('modern')) return 'Modern Jeep';
  if (type.includes('uv') || type.includes('van')) return 'UV Express';
  return 'Jeep';
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

type TimelineStep = {
  key: string;
  type: 'transit' | 'walk' | 'tricycle' | 'destination';
  title: string;
  subtitle: string;
  iconType: 'bus' | 'jeep' | 'walk' | 'tricycle' | 'destination';
  badgeBgColor: string;
};

export default function RouteResultCard({
  matched,
  isSelected,
  onPress,
  metricTags = [],
  onPressStartJourney,
  alternates = [],
  destinationName,
}: Props) {
  const { theme, isDark } = useTheme();
  const [showAlternates, setShowAlternates] = useState(false);
  const { legs, distanceKm, estimatedMinutes } = matched;
  const hasAlternates = alternates.length > 0;
  const tricycleExtension = matched.tricycleExtension;
  const isTransfer = legs.length > 1;
  const id = legs.map((l) => l.route.properties.code).join('+');
  const formatPeso = (value: number): string => String(Math.max(0, Math.round(value)));

  const legFareParts = legs.map((leg) => formatPeso(leg.estimatedFare));
  const totalTransitFare = legs.reduce((sum, leg) => sum + Math.max(0, Math.round(leg.estimatedFare)), 0);
  const fareFormulaText = legFareParts.map((fare) => `₱${fare}`).join(' + ');
  const extensionFare = tricycleExtension ? Math.max(0, Math.round(tricycleExtension.estimatedFare)) : 0;
  const totalWithExtensionFare = totalTransitFare + extensionFare;

  // Build vertical timeline steps
  const steps: TimelineStep[] = [];

  legs.forEach((leg, i) => {
    if (i > 0) {
      steps.push({
        key: `transfer-${i}`,
        type: 'walk',
        title: 'Walk to transfer stop',
        subtitle: 'Transfer connection',
        iconType: 'walk',
        badgeBgColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(10,22,40,0.08)',
      });
    }

    const vType = getVehicleTypeLabel(leg.route);
    const dest = legDestinationLabel(leg.route);
    const title = dest.toLowerCase().startsWith(vType.toLowerCase()) ? dest : `${vType} to ${dest}`;
    const isBus = (leg.route.properties.type || '').toLowerCase().includes('bus');

    steps.push({
      key: `leg-${i}-${leg.route.properties.code}`,
      type: 'transit',
      title,
      subtitle: `Ride ~${leg.estimatedMinutes} min • ${leg.distanceKm.toFixed(1)} km • ₱${formatPeso(leg.estimatedFare)}`,
      iconType: isBus ? 'bus' : 'jeep',
      badgeBgColor: i === 0 ? '#2196F3' : '#4CAF50',
    });
  });

  if (tricycleExtension) {
    if (tricycleExtension.walkToTerminalKm > 0.05) {
      steps.push({
        key: 'tricycle-walk',
        type: 'walk',
        title: `Walk to ${tricycleExtension.terminalName}`,
        subtitle: `Walk ~${tricycleExtension.walkToTerminalKm.toFixed(1)} km`,
        iconType: 'walk',
        badgeBgColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(10,22,40,0.08)',
      });
    }

    steps.push({
      key: 'tricycle-ride',
      type: 'tricycle',
      title: 'Last-mile Tricycle',
      subtitle: `${tricycleExtension.terminalName} • ~${tricycleExtension.estimatedMinutes} min • ₱${formatPeso(tricycleExtension.estimatedFare)}`,
      iconType: 'tricycle',
      badgeBgColor: isDark ? 'rgba(46,125,50,0.25)' : '#E8F5E9',
    });
  }

  steps.push({
    key: 'destination',
    type: 'destination',
    title: destinationName ? `Arrive at ${destinationName}` : 'Arrive at Destination',
    subtitle: 'End of route',
    iconType: 'destination',
    badgeBgColor: isDark ? 'rgba(232,160,32,0.25)' : 'rgba(232,160,32,0.15)',
  });

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: isSelected
            ? isDark
              ? 'rgba(232,160,32,0.08)'
              : 'rgba(232,160,32,0.04)'
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
      {/* Top row: tags + ETA + Fare */}
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
        <View style={styles.topRightWrap}>
          <View style={styles.etaBadge}>
            <Ionicons name="time-outline" size={13} color={theme.textSecondary} />
            <Text style={[styles.etaText, { color: theme.textSecondary }]}>{estimatedMinutes} min</Text>
          </View>
          <Text style={[styles.topFareText, { color: theme.text }]}>₱{formatPeso(totalWithExtensionFare)}</Text>
        </View>
      </View>

      {/* Vertical Timeline */}
      <View style={styles.timelineContainer}>
        {steps.map((step, index) => {
          const isFirst = index === 0;
          const isLast = index === steps.length - 1;

          return (
            <View key={step.key} style={styles.timelineRow}>
              {/* Left column: vertical connecting line + node icon */}
              <View style={styles.timelineLeft}>
                <View
                  style={[
                    styles.timelineLineTop,
                    {
                      backgroundColor: isFirst
                        ? 'transparent'
                        : isDark
                        ? 'rgba(255,255,255,0.15)'
                        : 'rgba(10,22,40,0.12)',
                    },
                  ]}
                />
                <View style={[styles.nodeBadge, { backgroundColor: step.badgeBgColor }]}>
                  {step.iconType === 'bus' ? (
                    <Image source={require('../assets/icons/bus-icon.png')} style={styles.nodeIconImage} resizeMode="contain" />
                  ) : step.iconType === 'jeep' ? (
                    <Image source={require('../assets/icons/jeepney-icon.png')} style={styles.nodeIconImage} resizeMode="contain" />
                  ) : step.iconType === 'tricycle' ? (
                    <Image source={require('../assets/icons/tricycle-icon.png')} style={styles.nodeIconImageTricycle} resizeMode="contain" />
                  ) : step.iconType === 'walk' ? (
                    <Ionicons name="walk-outline" size={13} color={isDark ? '#E0E0E0' : COLORS.navy} />
                  ) : (
                    <Ionicons name="location" size={13} color="#E8A020" />
                  )}
                </View>
                <View
                  style={[
                    styles.timelineLineBottom,
                    {
                      backgroundColor: isLast
                        ? 'transparent'
                        : isDark
                        ? 'rgba(255,255,255,0.15)'
                        : 'rgba(10,22,40,0.12)',
                    },
                  ]}
                />
              </View>

              {/* Right column: Title & Subtitle */}
              <View style={styles.timelineRight}>
                <Text style={[styles.stepTitle, { color: theme.text }]} numberOfLines={1}>
                  {step.title}
                </Text>
                <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                  {step.subtitle}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Alternates toggle */}
      {hasAlternates && (
        <TouchableOpacity
          style={[styles.alternatesToggleBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(10,22,40,0.04)' }]}
          activeOpacity={0.7}
          onPress={() => setShowAlternates((prev) => !prev)}
        >
          <Ionicons name="repeat-outline" size={13} color={theme.textSecondary} />
          <Text style={[styles.alternatesToggleText, { color: theme.textSecondary }]}>
            {showAlternates ? 'Hide alternate jeepneys' : `View ${alternates.length} alternate jeepney${alternates.length > 1 ? 's' : ''}`}
          </Text>
          <Ionicons name={showAlternates ? 'chevron-up' : 'chevron-down'} size={13} color={theme.textSecondary} />
        </TouchableOpacity>
      )}

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
              {alt.legs.map((leg, i) => {
                const vType = getVehicleTypeLabel(leg.route);
                const dest = legDestinationLabel(leg.route);
                const label = dest.toLowerCase().startsWith(vType.toLowerCase()) ? dest : `${vType} ${dest}`;

                return (
                  <React.Fragment key={leg.route.properties.code}>
                    {i > 0 && (
                      <View style={[styles.walkBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(10,22,40,0.08)' }]}>
                        <Ionicons name="walk-outline" size={11} color={isDark ? '#E0E0E0' : COLORS.navy} />
                        <Text style={[styles.walkBadgeText, { color: isDark ? '#E0E0E0' : COLORS.navy, fontSize: 10 }]}>Walk</Text>
                      </View>
                    )}
                    <View style={[styles.codeBadge, styles.altCodeBadge, i > 0 && { backgroundColor: '#4CAF50' }]}>
                      <Image source={getVehicleIcon(leg.route)} style={styles.jeepneyIcon} resizeMode="contain" />
                      <Text style={styles.codeText}>{label}</Text>
                    </View>
                  </React.Fragment>
                );
              })}
            </View>
          ))}
        </View>
      ) : null}

      {/* Bottom row: Distance & Fare formula */}
      <View style={styles.bottomRow}>
        <View style={styles.distanceWrap}>
          <Ionicons name="navigate-outline" size={13} color={theme.textSecondary} />
          <Text style={[styles.distanceText, { color: theme.textSecondary }]}>{distanceKm.toFixed(1)} km</Text>
        </View>
        <View style={styles.fareWrap}>
          <Text style={[styles.fareFormulaText, { color: theme.textSecondary }]}>
            {isTransfer || tricycleExtension
              ? `${fareFormulaText}${tricycleExtension ? ` + ₱${formatPeso(extensionFare)}` : ''}`
              : `Base fare ₱${formatPeso(totalTransitFare)}`}
          </Text>
        </View>
      </View>

      {/* Action Buttons for Selected Route */}
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
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    flexWrap: 'wrap',
    gap: 4,
  },
  topRightWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  },
  topFareText: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '800',
    color: '#E8A020',
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
  // Timeline Styles
  timelineContainer: {
    marginVertical: 4,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  timelineLeft: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    position: 'relative',
  },
  timelineLineTop: {
    position: 'absolute',
    top: 0,
    bottom: '50%',
    width: 2,
    left: 15,
  },
  timelineLineBottom: {
    position: 'absolute',
    top: '50%',
    bottom: 0,
    width: 2,
    left: 15,
  },
  nodeBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  nodeIconImage: {
    width: 14,
    height: 14,
  },
  nodeIconImageTricycle: {
    width: 16,
    height: 16,
  },
  timelineRight: {
    flex: 1,
    paddingLeft: 8,
    paddingVertical: 4,
    justifyContent: 'center',
  },
  stepTitle: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  stepSubtitle: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  // Alternates styles
  alternatesToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  alternatesToggleText: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '600',
  },
  alternatesWrap: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginVertical: 6,
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
  walkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  walkBadgeText: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '700',
  },
  codeText: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  // Bottom Row Styles
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128,128,128,0.1)',
  },
  distanceWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  distanceText: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.caption,
    fontWeight: '600',
  },
  fareWrap: {
    alignItems: 'flex-end',
  },
  fareFormulaText: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '600',
  },
  startJourneyBtn: {
    marginTop: 12,
    height: 48,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  startJourneyText: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.navy,
  },
});
