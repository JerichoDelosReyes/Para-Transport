import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '../constants/theme';
import { useStore } from '../store/useStore';
import { supabase } from '../config/supabaseClient';
import JeepIllustration from '../assets/illustrations/welcomeScreen-jeep2.svg';

const SkeletonCard = () => {
  const animatedValue = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        })
      ])
    ).start();
  }, [animatedValue]);

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7]
  });

  return (
    <View style={styles.historyCard}>
      <View style={styles.historyHeader}>
        <Animated.View style={[{ width: 140, height: 16, backgroundColor: '#E5E7EB', borderRadius: 4 }, { opacity }]} />
        <Animated.View style={[{ width: 60, height: 28, backgroundColor: '#E5E7EB', borderRadius: 8 }, { opacity }]} />
      </View>
      <View style={styles.routeSection}>
        <Animated.View style={[{ width: '80%', height: 16, backgroundColor: '#E5E7EB', borderRadius: 4, marginBottom: 8 }, { opacity }]} />
        <Animated.View style={[{ width: '60%', height: 16, backgroundColor: '#E5E7EB', borderRadius: 4 }, { opacity }]} />
      </View>
      <View style={styles.metricsRow}>
        <Animated.View style={[{ width: 70, height: 26, backgroundColor: '#E5E7EB', borderRadius: 6 }, { opacity }]} />
      </View>
    </View>
  );
};

export default function PointsHistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useStore((state) => state.user);
  
  const [pointsHistory, setPointsHistory] = useState<any[]>(user?.points_history || []);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchPointsHistory() {
      if (!user?.id) {
        setIsLoading(false);
        return;
      }
      
      try {
        const { data, error } = await supabase
          .from('users')
          .select('points_history')
          .eq('id', user.id)
          .single();
          
        if (!error && data?.points_history) {
          setPointsHistory(data.points_history || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchPointsHistory();
  }, [user?.id]);

  return (
    <View style={styles.screen}>
      <View style={[styles.topSection, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.buttonBack} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color={COLORS.navy} />
          </TouchableOpacity>
          <Text style={styles.headerTitleText}>POINTS</Text>
          <View style={{ width: 44, height: 44 }} />
        </View>
      </View>

      <View style={styles.bottomSection}>
        <ScrollView 
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          {isLoading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : pointsHistory.length === 0 ? (
             <View style={styles.emptyContainer}>
               <JeepIllustration width={220} height={150} />
               <Text style={styles.emptyTitle}>WALA PANG POINTS.</Text>
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
                      <Text style={styles.metricText}>{item.time || Math.round((item.distance || 0) * 3) || 5} min</Text>
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
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerTitleText: {
    fontFamily: 'Cubao',
    fontSize: TYPOGRAPHY.screenTitle,
    color: '#000000',
  },
  bottomSection: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: SPACING.screenX,
    paddingTop: 16,
    gap: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    backgroundColor: COLORS.card,
    padding: SPACING.cardPadding,
  },
  emptyTitle: {
    marginTop: 8,
    fontFamily: 'Cubao',
    fontSize: 24,
    color: COLORS.navy,
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
