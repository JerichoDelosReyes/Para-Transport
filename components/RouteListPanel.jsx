/**
 * RouteListPanel — A draggable bottom sheet that lists all transit routes
 * grouped by type (Bus, Jeepney, UV Express).
 * Tapping a route calls onSelectRoute to highlight and pan on the map.
 */
import React, { useRef, useMemo } from 'react';
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
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '../constants/theme';
import { ROUTE_COLORS, ROUTE_LABELS } from '../services/parseRoutes';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const COLLAPSED_HEIGHT = 120;
const EXPANDED_HEIGHT = SCREEN_HEIGHT * 0.55;

const TYPE_ORDER = ['bus', 'jeepney', 'share_taxi'];
const TYPE_ICONS = {
  bus: 'bus',
  jeepney: 'car',
  share_taxi: 'car-sport',
};

export default function RouteListPanel({ routes, selectedRouteId, onSelectRoute }) {
  const panY = useRef(new Animated.Value(0)).current;
  const lastOffset = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 8,
      onPanResponderGrant: () => {
        panY.setOffset(lastOffset.current);
        panY.setValue(0);
      },
      onPanResponderMove: Animated.event([null, { dy: panY }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_, gs) => {
        panY.flattenOffset();
        const maxUp = -(EXPANDED_HEIGHT - COLLAPSED_HEIGHT);
        // Snap to expanded or collapsed
        if (gs.dy < -50) {
          Animated.spring(panY, { toValue: maxUp, useNativeDriver: false, bounciness: 4 }).start();
          lastOffset.current = maxUp;
        } else {
          Animated.spring(panY, { toValue: 0, useNativeDriver: false, bounciness: 4 }).start();
          lastOffset.current = 0;
        }
      },
    })
  ).current;

  const sheetHeight = panY.interpolate({
    inputRange: [-(EXPANDED_HEIGHT - COLLAPSED_HEIGHT), 0],
    outputRange: [EXPANDED_HEIGHT, COLLAPSED_HEIGHT],
    extrapolate: 'clamp',
  });

  // Group routes by type
  const grouped = useMemo(() => {
    const groups = {};
    for (const type of TYPE_ORDER) {
      groups[type] = [];
    }
    for (const route of routes) {
      if (groups[route.type]) {
        groups[route.type].push(route);
      }
    }
    return groups;
  }, [routes]);

  const totalCount = routes.length;

  return (
    <Animated.View style={[styles.container, { height: sheetHeight }]}>
      <View {...panResponder.panHandlers} style={styles.handleArea}>
        <View style={styles.dragHandle} />
        <Text style={styles.title}>
          TRANSIT ROUTES{totalCount > 0 ? ` (${totalCount})` : ''}
        </Text>
      </View>

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {TYPE_ORDER.map((type) => {
          const group = grouped[type];
          if (!group || group.length === 0) return null;

          return (
            <View key={type} style={styles.group}>
              <View style={styles.groupHeader}>
                <View style={[styles.groupDot, { backgroundColor: ROUTE_COLORS[type] }]} />
                <Text style={styles.groupTitle}>
                  {ROUTE_LABELS[type]} ({group.length})
                </Text>
              </View>
              {group.map((route) => (
                <TouchableOpacity
                  key={route.id}
                  style={[
                    styles.routeCard,
                    selectedRouteId === route.id && styles.routeCardSelected,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => onSelectRoute(route)}
                >
                  <View style={[styles.routeIcon, { backgroundColor: route.color + '20' }]}>
                    <Ionicons name={TYPE_ICONS[route.type]} size={18} color={route.color} />
                  </View>
                  <View style={styles.routeInfo}>
                    <Text style={styles.routeName} numberOfLines={1}>
                      {route.ref ? `[${route.ref}] ` : ''}{route.name}
                    </Text>
                    {(route.from || route.to) ? (
                      <Text style={styles.routeMeta} numberOfLines={1}>
                        {route.from}{route.from && route.to ? ' → ' : ''}{route.to}
                      </Text>
                    ) : null}
                    {route.operator ? (
                      <Text style={styles.routeOperator} numberOfLines={1}>
                        {route.operator}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          );
        })}

        {totalCount === 0 && (
          <Text style={styles.emptyText}>No transit routes found in this area.</Text>
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
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 12,
    zIndex: 20,
  },
  handleArea: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 10,
  },
  dragHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(10,22,40,0.2)',
    marginBottom: 10,
  },
  title: {
    fontFamily: 'Cubao',
    fontSize: 18,
    color: COLORS.navy,
    letterSpacing: 0.5,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.screenX,
    paddingBottom: 100,
  },
  group: {
    marginBottom: 16,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  groupDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  groupTitle: {
    fontFamily: 'Inter',
    fontSize: TYPOGRAPHY.label,
    fontWeight: '700',
    color: COLORS.navy,
  },
  routeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.card,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(10,22,40,0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  routeCardSelected: {
    borderColor: '#E8A020',
    borderWidth: 2,
    backgroundColor: 'rgba(232,160,32,0.06)',
  },
  routeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  routeInfo: {
    flex: 1,
  },
  routeName: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.navy,
  },
  routeMeta: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  routeOperator: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: COLORS.textLabel,
    marginTop: 1,
  },
  emptyText: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingVertical: 20,
  },
});
