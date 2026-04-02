import { ScrollView, StyleSheet, Text, View, TouchableOpacity, Alert } from 'react-native';
import { useState, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '../../constants/theme';
import { ProfileButton } from '../../components/ProfileButton';
import { useStore } from '../../store/useStore';
import JeepIllustration from '../../assets/illustrations/welcomeScreen-jeep2.svg';

const HISTORY_FILTERS = ['All', 'Today', 'Yesterday', 'Older'] as const;
type HistoryFilter = typeof HISTORY_FILTERS[number];
const ITEMS_PER_PAGE = 10;

export default function RoutesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomSpace = insets.bottom > 0 ? insets.bottom * 0.6 : 24;
  const bottomPadding = 48 + bottomSpace + 16;
  const user = useStore((state) => state.user);
  const setPendingRouteSearch = useStore((state) => state.setPendingRouteSearch);
  const saveRoute = useStore((state) => state.saveRoute);
  const removeSavedRoute = useStore((state) => state.removeSavedRoute);
  const isGuestAccount = useStore((state) => state.sessionMode === 'guest');

  const [activeFilter, setActiveFilter] = useState<HistoryFilter>('All');
  const [page, setPage] = useState(1);

  const handleFilterChange = (filter: HistoryFilter) => {
    setActiveFilter(filter);
    setPage(1);
  };

  const filteredHistory = useMemo(() => {
    const history = user.commute_history || [];
    if (!history.length) return [];

    const now = new Date();
    const todayStr = now.toDateString();
    
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    return history.filter((item: any) => {
      if (activeFilter === 'All') return true;
      if (!item.timestamp) return activeFilter === 'Older';
      
      const itemDate = new Date(item.timestamp);
      const itemStr = itemDate.toDateString();

      if (activeFilter === 'Today') {
        return itemStr === todayStr;
      }
      if (activeFilter === 'Yesterday') {
        return itemStr === yesterdayStr;
      }
      if (activeFilter === 'Older') {
        return itemStr !== todayStr && itemStr !== yesterdayStr;
      }
      return true;
    });
  }, [user.commute_history, activeFilter]);

  const totalPages = Math.ceil(filteredHistory.length / ITEMS_PER_PAGE);
  const displayedHistory = filteredHistory.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  
  const getPageNumbers = () => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (page <= 3) {
      return [1, 2, 3, 4, '...', totalPages];
    }
    if (page >= totalPages - 2) {
      return [1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, '...', page - 1, page, page + 1, '...', totalPages];
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>History</Text>
        <ProfileButton />
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: COLORS.background }}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        {isGuestAccount ? (
          <View style={styles.emptyState}>
            <JeepIllustration width={220} height={150} />
            <Text style={styles.emptyTitle}>Sign in to view history.</Text>
          </View>
        ) : !user.commute_history || user.commute_history.length === 0 ? (
          <View style={styles.emptyState}>
            <JeepIllustration width={220} height={150} />
            <Text style={styles.emptyTitle}>Wala pang history.</Text>
          </View>
        ) : (
          <>
            <View style={styles.quickActionsContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modeScroll}>
                {HISTORY_FILTERS.map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.modePill, activeFilter === mode && styles.modePillActive]}
                    onPress={() => handleFilterChange(mode)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.modePillText, activeFilter === mode && styles.modePillTextActive]}>{mode}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {displayedHistory.length > 0 ? (
              displayedHistory.map((item: any, index: number) => {
                const getShortName = (name: string) => name ? name.split(',')[0].trim() : name;
                const originName = item.origin?.name && item.origin.name !== 'Current Location' ? getShortName(item.origin.name) : 'Your Location';
                const destName = item.destination?.name && item.destination.name !== 'Dropped Pin' ? getShortName(item.destination.name) : 'Pinned Location';
                const targetName = `${originName} to ${destName}`;
                const isSaved = user.saved_routes?.some((r: any) => 
                  r.name === targetName || (r.legs && r.legs[0]?.fromObj?.lat === item.origin?.lat && r.legs[0]?.toObj?.lat === item.destination?.lat && item.destination?.lat)
                );
                return (
                    <View key={item.id || index} style={styles.historyCard}>
                      <View style={styles.historyCardTop}>
                        <Text style={styles.historyRouteName} numberOfLines={1}>
                          {targetName}
                        </Text>
                        <TouchableOpacity
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          onPress={() => {
                            if (!isSaved) {
                              saveRoute({
                                id: Date.now(),
                                name: targetName,
                                legs: [{ mode: 'Custom Route', from: originName, to: destName, fromObj: item.origin || null, toObj: item.destination }],
                                total_fare: item.fare || 0,
                              });
                              Alert.alert('Saved', 'Route has been added to your Saved page.');
                            } else {
                              const routeToRemove = user.saved_routes?.find((r: any) => 
                                r.name === targetName || (r.legs && r.legs[0]?.fromObj?.lat === item.origin?.lat && r.legs[0]?.toObj?.lat === item.destination?.lat && item.destination?.lat)
                              );
                              if (routeToRemove) {
                                removeSavedRoute(routeToRemove.id);
                              }
                            }
                          }}
                        >
                          <Ionicons name={isSaved ? "bookmark" : "bookmark-outline"} size={18} color={isSaved ? COLORS.primary : COLORS.textMuted} />
                        </TouchableOpacity>
                      </View>
                      <View>
                        <Text style={styles.historyLegSummary}>Recent Search</Text>
                        <Text style={[styles.historyLegSummary, { marginTop: 2, fontSize: 10, color: '#9CA3AF' }]}>
                          {item.timestamp ? (new Date(item.timestamp).toLocaleDateString() + ' at ' + new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : 'Recent'}
                        </Text>
                      </View>
                      <View style={[styles.historyCardBottom, { justifyContent: 'flex-end' }]}>
                        <TouchableOpacity 
                          style={styles.historyGhostButton} 
                          activeOpacity={0.9} 
                          onPress={() => {
                            setPendingRouteSearch({ origin: item.origin || null, destination: item.destination });
                            router.navigate('/(tabs)');
                          }}
                        >
                          <Text style={styles.historyGhostButtonText}>View Route</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
              })
            ) : (
              <View style={styles.emptyFilterState}>
                <Text style={styles.emptyTitle}>No history found.</Text>
              </View>
            )}

            {totalPages > 1 && (
              <View style={styles.paginationContainer}>
                <TouchableOpacity 
                  style={[styles.paginationArrow, page === 1 && styles.paginationArrowDisabled]}
                  onPress={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  activeOpacity={0.8}
                >
                  <Ionicons name="arrow-back" size={18} color={page === 1 ? 'rgba(10,22,40,0.3)' : '#0A1628'} />
                </TouchableOpacity>
                <View style={styles.paginationPill}>
                  {getPageNumbers().map((pageNum, idx) => (
                    <TouchableOpacity
                      key={`${pageNum}-${idx}`}
                      style={[
                        styles.pageNumber, 
                        page === pageNum && styles.pageNumberActive,
                        pageNum === '...' && styles.pageNumberDots
                      ]}
                      onPress={() => typeof pageNum === 'number' ? setPage(pageNum) : null}
                      activeOpacity={pageNum === '...' ? 1 : 0.8}
                    >
                      <Text style={[
                        styles.pageNumberText, 
                        page === pageNum && styles.pageNumberTextActive,
                        pageNum === '...' && styles.pageNumberTextDots
                      ]}>
                        {pageNum}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity 
                  style={[styles.paginationArrow, page === totalPages && styles.paginationArrowDisabled]}
                  onPress={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  activeOpacity={0.8}
                >
                  <Ionicons name="arrow-forward" size={18} color={page === totalPages ? 'rgba(10,22,40,0.3)' : '#0A1628'} />
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F5C518',
  },
  header: {
    backgroundColor: '#F5C518',
    paddingHorizontal: SPACING.screenX,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 64,
  },
  headerTitle: {
    fontFamily: 'Cubao',
    fontSize: TYPOGRAPHY.screenTitle,
    color: '#0A1628',
  },
  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#F5C518',
    paddingHorizontal: SPACING.screenX,
    paddingBottom: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  switchTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  switchTabActive: {
    borderBottomColor: '#0A1628',
  },
  switchTabText: {
    fontFamily: 'Cubao',
    fontSize: 18,
    color: 'rgba(10,22,40,0.5)',
  },
  switchTabTextActive: {
    color: '#0A1628',
  },
  content: {
    paddingHorizontal: SPACING.screenX,
    paddingTop: 20,
    paddingBottom: 24,
    gap: SPACING.cardGap,
  },
  sectionHeader: {
    marginBottom: 20,
    alignItems: 'center',
  },
  sectionTitle: {
    fontFamily: 'Cubao',
    fontSize: 20,
    color: COLORS.navy,
    letterSpacing: 0.5,
  },
  quickActionsContainer: {
    marginBottom: 14,
  },
  modeScroll: {
    gap: 8,
    paddingBottom: 6,
  },
  modePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(10,22,40,0.12)',
  },
  modePillActive: {
    backgroundColor: '#0A1628',
    borderColor: '#0A1628',
  },
  modePillText: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.navy,
  },
  modePillTextActive: {
    color: '#FFFFFF',
  },
  group: {
    marginBottom: 20,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
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
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(10,22,40,0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  routeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  routeIconImage: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
  },
  routeInfo: {
    flex: 1,
  },
  routeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  routeName: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.navy,
    flexShrink: 1,
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
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#DCFCE7',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  verifiedBadgeText: {
    fontFamily: 'Inter',
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
  },
  emptyState: {
    alignItems: 'center',
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    backgroundColor: COLORS.card,
    padding: SPACING.cardPadding,
  },
  emptyFilterState: {
    alignItems: 'center',
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    backgroundColor: COLORS.card,
    padding: SPACING.cardPadding,
    marginTop: 4,
  },
  paginationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    marginBottom: 48,
    gap: 12,
  },
  paginationArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(10,22,40,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  paginationArrowDisabled: {
    backgroundColor: '#F3F4F6',
    borderColor: 'rgba(10,22,40,0.04)',
    shadowOpacity: 0,
    elevation: 0,
  },
  paginationPill: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(10,22,40,0.08)',
    borderRadius: 24,
    paddingHorizontal: 4,
    paddingVertical: 4,
    alignItems: 'center',
    gap: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  pageNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageNumberActive: {
    backgroundColor: '#0A1628',
  },
  pageNumberDots: {
    width: 16,
    backgroundColor: 'transparent',
  },
  pageNumberText: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '600',
    color: '#0A1628',
  },
  pageNumberTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  pageNumberTextDots: {
    color: '#0A1628',
    opacity: 0.4,
  },
  emptyTitle: {
    marginTop: 8,
    fontFamily: 'Cubao',
    fontSize: 24,
    color: COLORS.navy,
  },
  skeletonContainer: {
    paddingTop: 10,
  },
  skeletonCard: {
    height: 70,
    backgroundColor: '#E2E8F0',
    borderRadius: RADIUS.card,
    marginBottom: 10,
    opacity: 0.6,
  },
  historyCard: {
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  historyCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyRouteName: {
    flex: 1,
    marginRight: 8,
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: 15,
    color: COLORS.textStrong,
  },
  historyLegSummary: {
    marginTop: 4,
    fontFamily: 'Inter',
    fontSize: 12,
    color: COLORS.textMuted,
  },
  historyCardBottom: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  historyGhostButton: {
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.navy,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: COLORS.card,
  },
  historyGhostButtonText: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.navy,
  },
});