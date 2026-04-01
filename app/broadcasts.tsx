import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { COLORS, SPACING, TYPOGRAPHY } from '../constants/theme';
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
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={COLORS.navy} />
        </TouchableOpacity>
        <Text style={styles.title}>BROADCASTS</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
        ) : broadcasts.length === 0 ? (
          <Text style={styles.emptyText}>No recent broadcasts found.</Text>
        ) : (
          broadcasts.map((b) => (
            <View key={b.id} style={styles.cardWrapper}>
              <BlurView intensity={40} tint="dark" style={[styles.card, { backgroundColor: bgColors[b.type] || bgColors.info }]}>
                <Ionicons name={icons[b.type] as any} size={28} color="#FFF" style={styles.icon} />
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
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.screenX,
    paddingBottom: 16,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: 'Cubao', fontSize: 24, color: COLORS.navy },
  content: { padding: SPACING.screenX, paddingBottom: 40 },
  emptyText: { textAlign: 'center', color: COLORS.textMuted, marginTop: 40, fontFamily: 'Inter' },
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