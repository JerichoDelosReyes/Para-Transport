import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '../constants/theme';
import { useTheme } from '../src/theme/ThemeContext';
import JeepIllustration from '../assets/illustrations/welcomeScreen-jeep2.svg';
import { supabase } from '../config/supabaseClient';

type BroadcastMessage = {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'alert' | 'critical';
  is_active: boolean;
  created_at: string;
};

export default function BroadcastsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const [broadcasts, setBroadcasts] = useState<BroadcastMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBroadcasts = async () => {
      const { data } = await supabase
        .from('broadcasts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (data) setBroadcasts(data);
      setLoading(false);
    };

    fetchBroadcasts();
  }, []);

  const bgColors: Record<string, string> = {
    info: 'rgba(10, 34, 64, 0.6)',
    warning: 'rgba(245, 158, 11, 0.65)',
    alert: 'rgba(220, 38, 38, 0.65)',
    critical: 'rgba(185, 28, 28, 0.75)',
  };

  const icons: Record<string, any> = {
    info: 'information-circle',
    warning: 'warning',
    alert: 'alert-circle',
    critical: 'warning',
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={{ backgroundColor: isDark ? '#E8A020' : COLORS.primary, paddingTop: insets.top }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
            <View style={[styles.iconButtonCircle, { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]}>
              <Ionicons name="chevron-back" size={24} color="#0A1628" />
            </View>
          </TouchableOpacity>
          <Text style={[styles.headerTitleText, { color: '#0A1628' }]}>BROADCASTS</Text>
          <View style={{ width: 44, height: 44 }} />
        </View>
      </View>

      <View style={styles.bottomSection}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {loading ? (
            <ActivityIndicator size="large" color={isDark ? theme.text : COLORS.primary} style={{ marginTop: 40 }} />
          ) : broadcasts.length === 0 ? (
            <View style={[styles.emptyContainer, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
              <JeepIllustration width={220} height={150} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>WALA PANG BROADCASTS.</Text>
            </View>
          ) : (
            broadcasts.map((b) => (
              <View key={b.id} style={styles.cardWrapper}>
                <BlurView intensity={40} tint="dark" style={[styles.card, { backgroundColor: bgColors[b.type] || bgColors.info }]}>
                  {b.type === 'critical' ? (
                    <Text style={[styles.icon, { color: '#FFF', fontSize: 28, fontWeight: '900', width: 28, textAlign: 'center' }]}>!!</Text>
                  ) : (
                    <Ionicons name={icons[b.type] as any} size={28} color="#FFF" style={styles.icon} />
                  )}
                  <View style={styles.textContainer}>
                    <Text style={styles.cardTitle}>{b.title}</Text>
                    <Text style={styles.cardMessage}>{b.message}</Text>
                    <Text style={styles.dateText}>{new Date(b.created_at).toLocaleDateString()} {new Date(b.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</Text>
                  </View>
                </BlurView>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.screenX,
    paddingVertical: 14,
    height: 64,
  },
  headerTitleText: {
    fontFamily: 'Cubao',
    fontSize: TYPOGRAPHY.screenTitle,
    color: '#0A1628',
  },
  iconButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButtonCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomSection: {
    flex: 1,
  },
  content: {
    paddingHorizontal: SPACING.screenX,
    paddingTop: 16,
    paddingBottom: 40,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    backgroundColor: '#FFFFFF',
    padding: SPACING.cardPadding,
  },
  emptyTitle: {
    marginTop: 8,
    fontFamily: 'Cubao',
    fontSize: 24,
    color: COLORS.navy,
  },
  cardWrapper: {
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  card: {
    flexDirection: 'row',
    padding: 16,
  },
  icon: { marginRight: 16, marginTop: 2 },
  textContainer: { flex: 1 },
  cardTitle: { fontFamily: 'Inter', fontWeight: '700', fontSize: 16, color: '#FFF', marginBottom: 4 },
  cardMessage: { fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.9)', lineHeight: 20, marginBottom: 8 },
  dateText: { fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
});