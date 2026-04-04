import React from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '../constants/theme';
import { useStore } from '../store/useStore';

export default function PointsHistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useStore((state) => state.user);

  const pointsHistory = user?.points_history || [];

  return (
    <View style={styles.screen}>
      <View style={[styles.topSection, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.buttonBack} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitleText}>POINTS HISTORY</Text>
          <View style={{ width: 44, height: 44 }} />
        </View>
      </View>

      <View style={styles.bottomSection}>
        <ScrollView 
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          {pointsHistory.length === 0 ? (
             <View style={styles.emptyContainer}>
               <Ionicons name="receipt-outline" size={48} color={COLORS.textMuted} />
               <Text style={styles.emptyText}>No points history yet.</Text>
               <Text style={styles.emptySubText}>Start traveling to earn points!</Text>
             </View>
          ) : (
            pointsHistory.map((item: any, index: number) => {
              const date = new Date(item.timestamp);
              const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              const formattedTime = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
              
              const isMultiplier = item.multiplier && item.multiplier > 1;

              return (
                <View key={item.id || index} style={styles.historyCard}>
                  <View style={styles.historyHeader}>
                    <View style={styles.dateBlock}>
                      <Ionicons name="calendar-outline" size={14} color={COLORS.textLabel} />
                      <Text style={styles.dateText}>{formattedDate} • {formattedTime}</Text>
                    </View>
                    <View style={[styles.pointsBadge, isMultiplier && styles.pointsBadgeGold]}>
                      <Text style={[styles.pointsAmount, isMultiplier && styles.pointsAmountGold]}>+{item.points || 0}</Text>
                      <Text style={[styles.pointsLabelInfo, isMultiplier && styles.pointsAmountGold]}>PTS</Text>
                    </View>
                  </View>
                  
                  <View style={styles.routeSection}>
                    <View style={styles.locationRow}>
                      <Ionicons name="radio-button-on" size={16} color={COLORS.navy} />
                      <Text style={styles.locationText} numberOfLines={1}>{item.origin || 'Current Location'}</Text>
                    </View>
                    <View style={styles.dottedLine} />
                    <View style={styles.locationRow}>
                      <Ionicons name="location" size={16} color={COLORS.primary} />
                      <Text style={styles.locationText} numberOfLines={1}>{item.destination || 'Destination'}</Text>
                    </View>
                  </View>

                  <View style={styles.metricsRow}>
                    <View style={styles.metricItem}>
                      <Ionicons name="time-outline" size={16} color={COLORS.textLabel} />
                      <Text style={styles.metricText}>{item.time || Math.round(item.distance * 3) || 5} min</Text>
                    </View>
                    {isMultiplier && (
                       <View style={styles.metricItemGold}>
                         <Ionicons name="flash" size={16} color="#B45309" />
                         <Text style={styles.metricTextGold}>x{item.multiplier} Rush Hour</Text>
                       </View>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  topSection: {
    backgroundColor: COLORS.primary,
    zIndex: 10,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.screenX,
    paddingVertical: 14,
    height: 64,
  },
  buttonBack: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleText: {
    fontFamily: 'Montserrat-Bold',
    fontSize: TYPOGRAPHY.section,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  bottomSection: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: SPACING.screenX,
    paddingTop: 24,
    gap: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
    padding: 32,
  },
  emptyText: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 18,
    color: COLORS.navy,
    marginTop: 16,
  },
  emptySubText: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 8,
    textAlign: 'center',
  },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.card,
    padding: SPACING.cardPadding,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  dateBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateText: {
    fontFamily: 'Inter',
    fontWeight: '500',
    fontSize: 13,
    color: COLORS.textLabel,
  },
  pointsBadge: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  pointsBadgeGold: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  pointsAmount: {
    fontFamily: 'Cubao',
    fontSize: 20,
    color: COLORS.navy,
  },
  pointsAmountGold: {
    color: '#92400E',
  },
  pointsLabelInfo: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: 3,
  },
  routeSection: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  locationText: {
    fontFamily: 'Inter',
    fontWeight: '500',
    fontSize: 14,
    color: COLORS.text,
    flex: 1,
  },
  dottedLine: {
    width: 2,
    height: 12,
    backgroundColor: '#D1D5DB',
    marginLeft: 7,
    marginVertical: 4,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  metricText: {
    fontFamily: 'Inter',
    fontWeight: '500',
    fontSize: 13,
    color: COLORS.textLabel,
  },
  metricItemGold: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  metricTextGold: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 13,
    color: '#B45309',
  }
});
