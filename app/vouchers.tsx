import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Clipboard, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '../constants/theme';
import { useTheme } from '../src/theme/ThemeContext';
import { useStore } from '../store/useStore';
import { supabase } from '../config/supabaseClient';
import { generateVoucher } from '../services/blockchainService';

// ─── Voucher Options ────────────────────────────────────────────────────────
// Earning rate: 2 pts/km base (3x rush hour, 4x Friday peak)
// Avg trip ~5km = ~10 pts
const VOUCHER_OPTIONS = [
  {
    type: 'discount',
    title: '₱5 Fare Discount',
    description: 'Get ₱5 off your next jeepney fare',
    points: 500,
    icon: 'ticket-outline' as const,
    color: '#10B981',
    bg: 'rgba(16, 185, 129, 0.1)',
    border: 'rgba(16, 185, 129, 0.3)',
  },
  {
    type: 'partner',
    title: 'Partner Discount',
    description: 'Discount at partner merchants',
    points: 750,
    icon: 'bag-handle-outline' as const,
    color: '#F59E0B',
    bg: 'rgba(245, 158, 11, 0.1)',
    border: 'rgba(245, 158, 11, 0.3)',
  },
  {
    type: 'free_ride',
    title: 'Free Jeepney Ride',
    description: '1 completely free jeepney ride',
    points: 1000,
    icon: 'bus-outline' as const,
    color: '#6366F1',
    bg: 'rgba(99, 102, 241, 0.1)',
    border: 'rgba(99, 102, 241, 0.3)',
  },
];

// ─── Voucher Status Badge ────────────────────────────────────────────────────
const StatusBadge = ({ status }: { status: string }) => {
  const colors: Record<string, { bg: string; text: string }> = {
    active:  { bg: 'rgba(16,185,129,0.12)', text: '#059669' },
    used:    { bg: 'rgba(107,114,128,0.12)', text: '#6B7280' },
    expired: { bg: 'rgba(239,68,68,0.12)', text: '#EF4444' },
  };
  const c = colors[status] || colors.active;
  return (
    <View style={[styles.statusBadge, { backgroundColor: c.bg }]}>
      <Text style={[styles.statusText, { color: c.text }]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Text>
    </View>
  );
};

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function VouchersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useStore((state) => state.user);
  const { theme, isDark } = useTheme();

  const [vouchers, setVouchers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<string | null>(null);

  // ── Fetch vouchers ────────────────────────────────────────────────────────
  const fetchVouchers = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    try {
      const { data } = await supabase
        .from('vouchers')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      setVouchers(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchVouchers(); }, [fetchVouchers]);

  // ── Redeem handler ────────────────────────────────────────────────────────
  const handleRedeem = async (option: typeof VOUCHER_OPTIONS[0]) => {
    if (!user?.id) return;
    if ((user.points || 0) < option.points) {
      Alert.alert(
        'Not Enough Points',
        `You need ${option.points} pts for this voucher. You have ${user.points || 0} pts.`
      );
      return;
    }

    Alert.alert(
      'Confirm Redemption',
      `Redeem ${option.points} points for "${option.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Redeem',
          onPress: async () => {
            setRedeeming(option.type);
            const result = await generateVoucher(user.id!, option.points, option.type);
            setRedeeming(null);

            if (result.success) {
              const buttons: any[] = [{ text: 'Got it!', onPress: fetchVouchers }];

              // If blockchain TX was recorded, offer a PolygonScan link
              if (result.explorer_url) {
                const { Linking } = require('react-native');
                buttons.unshift({
                  text: '🔗 View on Polygon',
                  onPress: () => Linking.openURL(result.explorer_url),
                });
              }

              Alert.alert(
                '🎉 Voucher Created!',
                `Your code: ${result.voucher_code}\n\nExpires in 30 days.${result.tx_hash ? '\n\n⛓️ Recorded on Polygon blockchain!' : ''}`,
                buttons
              );
            } else {
              Alert.alert('Failed', result.error || 'Could not generate voucher. Try again.');
            }
          },
        },
      ]
    );
  };

  // ── Copy code to clipboard ────────────────────────────────────────────────
  const copyCode = (code: string) => {
    if (Platform.OS === 'web') {
      navigator.clipboard?.writeText(code);
    } else {
      Clipboard.setString(code);
    }
    Alert.alert('Copied!', `"${code}" copied to clipboard.`);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.topSection, { paddingTop: insets.top, backgroundColor: isDark ? '#E8A020' : COLORS.primary }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <View style={[styles.iconBtnCircle, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Ionicons name="chevron-back" size={24} color="#0A1628" />
            </View>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: '#0A1628' }]}>MY VOUCHERS</Text>
          <View style={{ width: 44, height: 44 }} />
        </View>

        {/* Points balance banner */}
        <View style={[styles.balanceBanner, { backgroundColor: 'rgba(0,0,0,0.12)' }]}>
          <Text style={styles.balanceLabel}>Your Points</Text>
          <Text style={styles.balanceValue}>{user?.points || 0} pts</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Redeem section ────────────────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Ionicons name="gift" size={20} color="#E8A020" />
          <Text style={[styles.sectionTitle, { color: isDark ? '#FFFFFF' : '#0A1628' }]}>REDEEM POINTS</Text>
        </View>

        {VOUCHER_OPTIONS.map((opt) => {
          const canAfford = (user?.points || 0) >= opt.points;
          const isLoading = redeeming === opt.type;
          return (
            <TouchableOpacity
              key={opt.type}
              style={[
                styles.optionCard,
                { backgroundColor: isDark ? theme.cardBackground : opt.bg, borderColor: opt.border },
                !canAfford && { opacity: 0.5 },
              ]}
              activeOpacity={0.75}
              onPress={() => handleRedeem(opt)}
              disabled={!canAfford || !!redeeming}
            >
              <View style={[styles.optionIconWrap, { backgroundColor: opt.bg }]}>
                <Ionicons name={opt.icon} size={22} color={opt.color} />
              </View>
              <View style={styles.optionInfo}>
                <Text style={[styles.optionTitle, { color: isDark ? '#FFFFFF' : '#0A1628' }]}>{opt.title}</Text>
                <Text style={[styles.optionDesc, { color: theme.textSecondary }]}>{opt.description}</Text>
              </View>
              <View style={styles.optionRight}>
                {isLoading ? (
                  <ActivityIndicator size="small" color={opt.color} />
                ) : (
                  <>
                    <Text style={[styles.optionPoints, { color: opt.color }]}>{opt.points}</Text>
                    <Text style={[styles.optionPtsLabel, { color: opt.color }]}>pts</Text>
                  </>
                )}
              </View>
            </TouchableOpacity>
          );
        })}

        {/* ── My vouchers ───────────────────────────────────────────────── */}
        <View style={[styles.sectionHeader, { marginTop: 32 }]}>
          <Ionicons name="ticket" size={20} color="#E8A020" />
          <Text style={[styles.sectionTitle, { color: isDark ? '#FFFFFF' : '#0A1628' }]}>MY VOUCHERS</Text>
        </View>

        {loading ? (
          <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: 24 }} />
        ) : vouchers.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
            <View style={[styles.emptyIconWrap, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F6' }]}>
              <Ionicons name="ticket-outline" size={36} color={isDark ? '#9CA3AF' : '#6B7280'} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No vouchers yet</Text>
            <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
              Redeem your points above to get your first voucher!
            </Text>
          </View>
        ) : (
          vouchers.map((v) => {
            const isActive = v.status === 'active';
            const exp = new Date(v.expires_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
            return (
              <View key={v.id} style={[styles.voucherCard, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
                <View style={styles.voucherTop}>
                  <View style={styles.voucherInfo}>
                    <Text style={[styles.voucherDesc, { color: theme.text }]}>{v.description}</Text>
                    <Text style={[styles.voucherExpiry, { color: theme.textSecondary }]}>
                      {v.status === 'used' ? 'Used' : `Expires ${exp}`}
                    </Text>
                  </View>
                  <StatusBadge status={v.status} />
                </View>

                <View style={[styles.codeRow, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F9FAFB' }]}>
                  <Text style={[styles.codeText, { color: isDark ? '#FFFFFF' : '#0A1628' }]}>{v.voucher_code}</Text>
                  {isActive && (
                    <TouchableOpacity onPress={() => copyCode(v.voucher_code)} style={styles.copyBtn}>
                      <Ionicons name="copy-outline" size={18} color={COLORS.primary} />
                    </TouchableOpacity>
                  )}
                </View>

                <Text style={[styles.voucherPoints, { color: theme.textSecondary }]}>
                  {v.points_used} pts redeemed
                </Text>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1 },
  topSection: { backgroundColor: COLORS.primary, zIndex: 10 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.screenX,
    paddingVertical: 14,
    height: 64,
  },
  headerTitle: {
    fontFamily: 'Cubao',
    fontSize: TYPOGRAPHY.screenTitle,
  },
  iconBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  iconBtnCircle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  balanceBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: SPACING.screenX,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: RADIUS.card,
  },
  balanceLabel: { fontFamily: 'Inter', fontSize: 14, color: 'rgba(10,22,40,0.7)', fontWeight: '600' },
  balanceValue: { fontFamily: 'Cubao', fontSize: 22, color: '#0A1628' },
  content: { paddingHorizontal: SPACING.screenX, paddingTop: 24 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14,
  },
  sectionTitle: { fontFamily: 'Cubao', fontSize: 20 },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.card,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  optionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionInfo: { flex: 1 },
  optionTitle: { fontFamily: 'Inter', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  optionDesc: { fontFamily: 'Inter', fontSize: 12 },
  optionRight: { alignItems: 'center', minWidth: 40 },
  optionPoints: { fontFamily: 'Cubao', fontSize: 22 },
  optionPtsLabel: { fontFamily: 'Inter', fontSize: 10, fontWeight: '600', marginTop: -2 },
  emptyCard: {
    borderRadius: RADIUS.card, borderWidth: 1,
    padding: 32, alignItems: 'center', gap: 8,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontFamily: 'Cubao', fontSize: 18 },
  emptyDesc: { fontFamily: 'Inter', fontSize: 13, textAlign: 'center', lineHeight: 18 },
  voucherCard: {
    borderRadius: RADIUS.card, borderWidth: 1, padding: 14, marginBottom: 12, gap: 10,
  },
  voucherTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  voucherInfo: { flex: 1, marginRight: 8 },
  voucherDesc: { fontFamily: 'Inter', fontSize: 14, fontWeight: '700', marginBottom: 2 },
  voucherExpiry: { fontFamily: 'Inter', fontSize: 12 },
  codeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
  },
  codeText: { fontFamily: 'Cubao', fontSize: 18, letterSpacing: 1 },
  copyBtn: { padding: 4 },
  voucherPoints: { fontFamily: 'Inter', fontSize: 11 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontFamily: 'Inter', fontSize: 11, fontWeight: '700' },
});
