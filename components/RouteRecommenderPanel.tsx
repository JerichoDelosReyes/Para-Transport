import React, { useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../constants/theme';
import type { TransitLeg } from '../utils/routeSegments';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PANEL_MIN_HEIGHT = 0;
const PANEL_MAX_HEIGHT = SCREEN_HEIGHT * 0.6;

export type TransitRouteOption = {
  id: string;
  ref?: string;
  name?: string;
  type?: string;
  from?: string;
  to?: string;
  fare?: string | number;
  operator?: string;
  color?: string;
  verified?: boolean;
  coordinates?: { latitude: number; longitude: number }[];
  stops?: any[];
};

type Props = {
  visible: boolean;
  routeSummary: { distanceKm: number; durationMin: number } | null;
  transitLegs: TransitLeg[];
  onClose: () => void;
};

function formatFare(fare?: string | number): string {
  if (fare == null) return '';
  if (typeof fare === 'number') return `₱${fare}`;
  return fare;
}

function getTransitIcon(type?: string): string {
  switch (type) {
    case 'bus': return 'bus';
    case 'jeepney': return 'car';
    case 'uv_express': return 'car-sport';
    default: return 'trail-sign';
  }
}

export default function RouteRecommenderPanel({
  visible,
  routeSummary,
  transitLegs,
  onClose,
}: Props) {
  const panY = useRef(new Animated.Value(PANEL_MAX_HEIGHT)).current;
  const lastOffset = useRef(PANEL_MAX_HEIGHT);

  React.useEffect(() => {
    if (visible) {
      Animated.spring(panY, {
        toValue: PANEL_MIN_HEIGHT,
        useNativeDriver: false,
        bounciness: 4,
      }).start();
      lastOffset.current = PANEL_MIN_HEIGHT;
    } else {
      Animated.timing(panY, {
        toValue: PANEL_MAX_HEIGHT,
        duration: 300,
        useNativeDriver: false,
      }).start();
      lastOffset.current = PANEL_MAX_HEIGHT;
    }
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 10,
      onPanResponderGrant: () => {
        panY.setOffset(lastOffset.current);
        panY.setValue(0);
      },
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) {
          panY.setValue(gs.dy);
        }
      },
      onPanResponderRelease: (_, gs) => {
        panY.flattenOffset();
        if (gs.dy > 100 || gs.vy > 0.5) {
          Animated.timing(panY, {
            toValue: PANEL_MAX_HEIGHT,
            duration: 300,
            useNativeDriver: false,
          }).start(() => onClose());
          lastOffset.current = PANEL_MAX_HEIGHT;
        } else {
          Animated.spring(panY, {
            toValue: PANEL_MIN_HEIGHT,
            useNativeDriver: false,
            bounciness: 4,
          }).start();
          lastOffset.current = PANEL_MIN_HEIGHT;
        }
      },
    })
  ).current;

  // Compute summary stats
  const stats = useMemo(() => {
    const transitCount = transitLegs.filter(l => l.onTransit).length;
    const transfers = Math.max(0, transitCount - 1);
    let totalFare = 0;
    for (const leg of transitLegs) {
      if (leg.onTransit && leg.transitInfo?.fare != null) {
        const f = leg.transitInfo.fare;
        totalFare += typeof f === 'number' ? f : parseFloat(String(f).replace(/[^0-9.]/g, '')) || 0;
      }
    }
    return { transitCount, transfers, totalFare };
  }, [transitLegs]);

  if (!visible && lastOffset.current === PANEL_MAX_HEIGHT) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: panY }],
          height: PANEL_MAX_HEIGHT,
        },
      ]}
    >
      {/* Drag handle area */}
      <View {...panResponder.panHandlers} style={styles.handleArea}>
        <View style={styles.dragHandle} />
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Ionicons name="map" size={20} color={COLORS.navy} />
            <Text style={styles.title}>YOUR JOURNEY</Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={24} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Summary badges */}
        <View style={styles.summaryRow}>
          {routeSummary && (
            <View style={[styles.summaryBadge, { backgroundColor: '#FFF3D0' }]}>
              <Ionicons name="speedometer-outline" size={12} color="#E8A020" />
              <Text style={[styles.summaryBadgeText, { color: '#E8A020' }]}>
                {routeSummary.distanceKm.toFixed(1)} km • {Math.ceil(routeSummary.durationMin)} min
              </Text>
            </View>
          )}
          {stats.transfers > 0 && (
            <View style={[styles.summaryBadge, { backgroundColor: '#DBEAFE' }]}>
              <Ionicons name="swap-vertical" size={12} color="#3B82F6" />
              <Text style={[styles.summaryBadgeText, { color: '#3B82F6' }]}>
                {stats.transfers} transfer{stats.transfers !== 1 ? 's' : ''}
              </Text>
            </View>
          )}
          {stats.totalFare > 0 && (
            <View style={[styles.summaryBadge, { backgroundColor: '#DCFCE7' }]}>
              <Ionicons name="cash-outline" size={12} color="#22C55E" />
              <Text style={[styles.summaryBadgeText, { color: '#22C55E' }]}>
                ~₱{stats.totalFare}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Scrollable journey legs */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {transitLegs.map((leg, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === transitLegs.length - 1;
          const nextLeg = idx < transitLegs.length - 1 ? transitLegs[idx + 1] : null;

          return (
            <View key={`leg-${idx}`}>
              {/* Leg card */}
              <View style={styles.legRow}>
                {/* Timeline connector */}
                <View style={styles.timeline}>
                  {/* Top line */}
                  {!isFirst && (
                    <View style={[styles.timelineLine, styles.timelineLineTop, { backgroundColor: leg.onTransit ? (leg.transitInfo?.color || '#E8A020') : '#CCCCCC' }]} />
                  )}
                  {/* Dot */}
                  <View style={[
                    styles.timelineDot,
                    { backgroundColor: leg.onTransit ? (leg.transitInfo?.color || '#E8A020') : '#999999' },
                  ]}>
                    <Ionicons
                      name={leg.onTransit ? getTransitIcon(leg.transitInfo?.type) as any : 'walk'}
                      size={12}
                      color="#FFFFFF"
                    />
                  </View>
                  {/* Bottom line */}
                  {!isLast && (
                    <View style={[styles.timelineLine, styles.timelineLineBottom, { backgroundColor: leg.onTransit ? (leg.transitInfo?.color || '#E8A020') : '#CCCCCC' }]} />
                  )}
                </View>

                {/* Leg content */}
                <View style={[
                  styles.legCard,
                  leg.onTransit && { borderLeftColor: leg.transitInfo?.color || '#E8A020', borderLeftWidth: 3 },
                ]}>
                  {leg.onTransit && leg.transitInfo ? (
                    <>
                      {/* Transit header */}
                      <View style={styles.legHeader}>
                        <View style={[styles.legTypeBadge, { backgroundColor: leg.transitInfo.color || '#E8A020' }]}>
                          <Ionicons name={getTransitIcon(leg.transitInfo.type) as any} size={11} color="#FFFFFF" />
                          <Text style={styles.legTypeBadgeText}>
                            {(leg.transitInfo.type || 'transit').toUpperCase()}
                          </Text>
                        </View>
                        {leg.transitInfo.fare != null && (
                          <Text style={styles.legFare}>{formatFare(leg.transitInfo.fare)}</Text>
                        )}
                      </View>

                      {/* Route name */}
                      <Text style={styles.legRouteName} numberOfLines={1}>
                        {leg.transitInfo.ref ? `[${leg.transitInfo.ref}] ` : ''}
                        {leg.transitInfo.name || 'Transit Route'}
                      </Text>

                      {/* Board / Alight */}
                      <View style={styles.legStops}>
                        <View style={styles.legStopRow}>
                          <View style={[styles.legStopDot, { backgroundColor: '#22C55E' }]} />
                          <Text style={styles.legStopLabel}>Board at <Text style={styles.legStopName}>{leg.boardLabel}</Text></Text>
                        </View>
                        <View style={styles.legStopConnector} />
                        <View style={styles.legStopRow}>
                          <View style={[styles.legStopDot, { backgroundColor: '#EF4444' }]} />
                          <Text style={styles.legStopLabel}>Alight at <Text style={styles.legStopName}>{leg.alightLabel}</Text></Text>
                        </View>
                      </View>

                      {leg.transitInfo.verified && (
                        <View style={styles.verifiedRow}>
                          <Ionicons name="checkmark-circle" size={12} color="#22C55E" />
                          <Text style={styles.verifiedText}>Verified route</Text>
                        </View>
                      )}
                    </>
                  ) : (
                    <>
                      {/* Walking leg */}
                      <View style={styles.legHeader}>
                        <View style={[styles.legTypeBadge, { backgroundColor: '#999999' }]}>
                          <Ionicons name="walk" size={11} color="#FFFFFF" />
                          <Text style={styles.legTypeBadgeText}>WALK</Text>
                        </View>
                      </View>
                      <Text style={styles.legWalkText}>
                        {isFirst ? 'Walk to the nearest transit stop' : isLast ? 'Walk to your destination' : 'Walk to the next transit stop'}
                      </Text>
                    </>
                  )}
                </View>
              </View>

              {/* Transfer indicator between legs */}
              {nextLeg && leg.onTransit && nextLeg.onTransit && (
                <View style={styles.transferCard}>
                  <View style={styles.transferIconWrap}>
                    <Ionicons name="swap-vertical" size={16} color="#3B82F6" />
                  </View>
                  <View style={styles.transferTextWrap}>
                    <Text style={styles.transferTitle}>Transfer here</Text>
                    <Text style={styles.transferSubtitle}>
                      Get off and ride{' '}
                      <Text style={{ fontWeight: '700' }}>
                        {nextLeg.transitInfo?.ref || nextLeg.transitInfo?.name || 'next transit'}
                      </Text>
                    </Text>
                  </View>
                </View>
              )}
            </View>
          );
        })}

        {/* Destination marker */}
        <View style={styles.legRow}>
          <View style={styles.timeline}>
            <View style={[styles.timelineLine, styles.timelineLineTop, { backgroundColor: '#EF4444' }]} />
            <View style={[styles.timelineDot, { backgroundColor: '#EF4444' }]}>
              <Ionicons name="flag" size={12} color="#FFFFFF" />
            </View>
          </View>
          <View style={[styles.legCard, { paddingVertical: 10 }]}>
            <Text style={styles.legRouteName}>Destination</Text>
          </View>
        </View>

        {transitLegs.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="bus-outline" size={28} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>
              No transit route data for this path.
            </Text>
          </View>
        )}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 14,
    zIndex: 30,
  },
  handleArea: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: SPACING.screenX,
  },
  dragHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(10,22,40,0.2)',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontFamily: 'Cubao',
    fontSize: 20,
    color: COLORS.navy,
    letterSpacing: 0.5,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    alignSelf: 'flex-start',
    flexWrap: 'wrap',
  },
  summaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  summaryBadgeText: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '700',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.screenX,
    paddingBottom: 120,
    paddingTop: 8,
  },
  // --- Journey leg rows ---
  legRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  timeline: {
    width: 32,
    alignItems: 'center',
    position: 'relative',
  },
  timelineDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  timelineLine: {
    width: 3,
    flex: 1,
    borderRadius: 1.5,
  },
  timelineLineTop: {
    marginBottom: -1,
  },
  timelineLineBottom: {
    marginTop: -1,
  },
  legCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.card,
    padding: 12,
    marginLeft: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(10,22,40,0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  legHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  legTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  legTypeBadgeText: {
    fontFamily: 'Inter',
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  legFare: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '700',
    color: '#22C55E',
  },
  legRouteName: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.navy,
  },
  legStops: {
    marginTop: 8,
    gap: 2,
  },
  legStopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legStopDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legStopLabel: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textMuted,
  },
  legStopName: {
    fontWeight: '700',
    color: COLORS.navy,
  },
  legStopConnector: {
    width: 1,
    height: 10,
    backgroundColor: 'rgba(10,22,40,0.12)',
    marginLeft: 3.5,
  },
  legWalkText: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textMuted,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  verifiedText: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: '#22C55E',
  },
  // --- Transfer card ---
  transferCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 42,
    marginBottom: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.15)',
    gap: 10,
  },
  transferIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transferTextWrap: {
    flex: 1,
  },
  transferTitle: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '700',
    color: '#3B82F6',
  },
  transferSubtitle: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  // --- Empty state ---
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
});
