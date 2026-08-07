/**
 * blockchain-demo.tsx
 *
 * A simulation screen that demonstrates the full Para blockchain flow:
 * 1. User "starts" a simulated jeepney ride
 * 2. Animated progress tracks the journey
 * 3. On arrival: points are awarded + badges checked
 * 4. Badge unlock triggers real NFT mint on Polygon Amoy
 * 5. Shows real PolygonScan transaction link
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, ScrollView,
  Animated, Linking, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '../constants/theme';
import { useTheme } from '../src/theme/ThemeContext';
import { useStore } from '../store/useStore';
import { ensureUserWallet, mintBadgeNFT } from '../services/blockchainService';

// ─── Simulated Route Data ────────────────────────────────────────────────────
const SIMULATED_RIDE = {
  origin: 'Cubao Terminal',
  destination: 'Monumento',
  distance: 6.2,
  fare: 29,
  duration: 8000,       // 8 seconds animation
  pointsEarned: 35,
  badgeToUnlock: 'first_ride',
  badgeName: 'First Ride',
};

// ─── Step Log Item ────────────────────────────────────────────────────────────
type LogStep = {
  id: string;
  icon: string;
  text: string;
  status: 'pending' | 'loading' | 'done' | 'error';
  txHash?: string;
};

// ─── Step Log Component ───────────────────────────────────────────────────────
const LogItem = ({ step }: { step: LogStep }) => {
  const { theme } = useTheme();
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (step.status === 'loading') {
      Animated.loop(
        Animated.timing(spin, { toValue: 1, duration: 900, useNativeDriver: true })
      ).start();
    } else {
      spin.stopAnimation();
      spin.setValue(0);
    }
  }, [step.status]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const iconColor =
    step.status === 'done' ? '#10B981'
    : step.status === 'error' ? '#EF4444'
    : step.status === 'loading' ? '#E8A020'
    : theme.textSecondary;

  return (
    <View style={styles.logRow}>
      {step.status === 'loading' ? (
        <Animated.Text style={[styles.logIcon, { transform: [{ rotate }] }]}>⏳</Animated.Text>
      ) : (
        <Text style={[styles.logIcon, { color: iconColor }]}>
          {step.status === 'done' ? '✅'
           : step.status === 'error' ? '❌'
           : step.status === 'pending' ? '⬜' : step.icon}
        </Text>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.logText, {
          color: step.status === 'pending' ? theme.textSecondary : theme.text,
          opacity: step.status === 'pending' ? 0.5 : 1,
        }]}>
          {step.text}
        </Text>
        {step.txHash && (
          <TouchableOpacity onPress={() =>
            Linking.openURL(`https://amoy.polygonscan.com/tx/${step.txHash}`)
          }>
            <Text style={styles.txLink}>🔗 View on PolygonScan →</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function BlockchainDemoScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const user = useStore((state) => state.user);
  const addTripStats = useStore((state) => state.addTripStats);
  const unlockBadge = useStore((state) => state.unlockBadge);
  const badgesData = useStore((state) => state.badgesData);

  const [phase, setPhase] = useState<'idle' | 'riding' | 'done'>('idle');
  const [logs, setLogs] = useState<LogStep[]>([]);
  const progress = useRef(new Animated.Value(0)).current;
  const progressWidth = useRef(new Animated.Value(0)).current;
  const jeepX = useRef(new Animated.Value(0)).current;

  const updateLog = (id: string, updates: Partial<LogStep>) => {
    setLogs((prev) => prev.map((s) => s.id === id ? { ...s, ...updates } : s));
  };

  const sessionMode = useStore((state) => state.sessionMode);
  const isGuest = sessionMode !== 'auth';

  const startSimulation = async () => {
    if (isGuest) {
      Alert.alert(
        'Login Required',
        'You need to be logged in for blockchain simulation. The NFT will actually be minted on Polygon!',
        [{ text: 'OK' }]
      );
      return;
    }

    setPhase('riding');

    // Initialize log steps
    const initialLogs: LogStep[] = [
      { id: 'ride',    icon: '🚌', text: `Riding from ${SIMULATED_RIDE.origin} → ${SIMULATED_RIDE.destination}`, status: 'loading' },
      { id: 'points',  icon: '⭐', text: `Awarding +${SIMULATED_RIDE.pointsEarned} points`, status: 'pending' },
      { id: 'badge',   icon: '🏅', text: `Checking badge: "${SIMULATED_RIDE.badgeName}"`, status: 'pending' },
      { id: 'wallet',  icon: '👛', text: 'Provisioning your blockchain wallet', status: 'pending' },
      { id: 'mint',    icon: '🔗', text: 'Minting NFT badge on Polygon Amoy...', status: 'pending' },
      { id: 'done',    icon: '🎉', text: 'NFT permanently recorded on blockchain!', status: 'pending' },
    ];
    setLogs(initialLogs);

    // ── Animate the jeep across the progress bar ──────────────────────────
    Animated.parallel([
      Animated.timing(progressWidth, {
        toValue: 1,
        duration: SIMULATED_RIDE.duration,
        useNativeDriver: false,
      }),
      Animated.timing(jeepX, {
        toValue: 1,
        duration: SIMULATED_RIDE.duration,
        useNativeDriver: false,
      }),
    ]).start();

    // ── Step 1: Ride arrives (after animation) ────────────────────────────
    await new Promise((r) => setTimeout(r, SIMULATED_RIDE.duration));
    updateLog('ride', { status: 'done' });

    // ── Step 2: Award points ──────────────────────────────────────────────
    await new Promise((r) => setTimeout(r, 400));
    updateLog('points', { status: 'loading' });
    addTripStats({
      distance: SIMULATED_RIDE.distance,
      fare: SIMULATED_RIDE.fare,
      points: SIMULATED_RIDE.pointsEarned,
      time: 15,
      multiplier: 1,
      origin: SIMULATED_RIDE.origin,
      destination: SIMULATED_RIDE.destination,
    });
    await new Promise((r) => setTimeout(r, 600));
    updateLog('points', { status: 'done' });

    // ── Step 3: Check badge ───────────────────────────────────────────────
    await new Promise((r) => setTimeout(r, 300));
    updateLog('badge', { status: 'loading' });
    const alreadyHasBadge = (user?.badges || []).includes(SIMULATED_RIDE.badgeToUnlock);
    await new Promise((r) => setTimeout(r, 700));

    if (alreadyHasBadge) {
      updateLog('badge', { status: 'done', text: `Badge "${SIMULATED_RIDE.badgeName}" already earned ✓` });
      updateLog('wallet', { status: 'done', text: 'Wallet already exists ✓' });
      updateLog('mint', { status: 'done', text: 'NFT already minted on-chain ✓' });
      updateLog('done', { status: 'done', text: 'All good! Badge was already on blockchain.' });
      setPhase('done');
      return;
    }

    updateLog('badge', { status: 'done', text: `🏅 Badge unlocked: "${SIMULATED_RIDE.badgeName}"!` });

    // ── Step 4: Provision wallet ──────────────────────────────────────────
    await new Promise((r) => setTimeout(r, 300));
    updateLog('wallet', { status: 'loading' });

    let walletAddress: string | null = null;
    try {
      walletAddress = await ensureUserWallet(user.id!);
      updateLog('wallet', {
        status: 'done',
        text: `👛 Wallet ready: ${walletAddress ? walletAddress.slice(0, 10) + '...' : 'created'}`,
      });
    } catch (e) {
      updateLog('wallet', { status: 'error', text: 'Wallet provision failed — check Edge Function logs' });
    }

    // ── Step 5: Mint NFT ──────────────────────────────────────────────────
    await new Promise((r) => setTimeout(r, 400));
    updateLog('mint', { status: 'loading', text: '🔗 Minting NFT on Polygon Amoy... (~5–15 sec)' });

    // Unlock badge in local store (this also triggers the bg mint in useStore)
    // We call mintBadgeNFT directly here so we can get the txHash to display
    let txHash: string | undefined;
    try {
      const mintResult = await mintBadgeNFT(user.id!, SIMULATED_RIDE.badgeToUnlock);

      if (mintResult.success && mintResult.txHash) {
        txHash = mintResult.txHash;
        updateLog('mint', {
          status: 'done',
          text: `✅ NFT minted! TX: ${txHash.slice(0, 14)}...`,
          txHash,
        });
      } else if (mintResult.alreadyMinted) {
        updateLog('mint', { status: 'done', text: 'NFT was already minted on-chain ✓' });
      } else {
        // Show the real error from the Edge Function
        const reason = mintResult.error || 'Unknown error — check treasury wallet balance';
        updateLog('mint', {
          status: 'error',
          text: `Mint failed: ${reason}`,
        });
      }
    } catch (e: any) {
      updateLog('mint', {
        status: 'error',
        text: `Mint failed: ${e?.message || 'Network error'}`,
      });
    }

    // Unlock in store so badge shows in achievements screen
    unlockBadge(SIMULATED_RIDE.badgeToUnlock);

    // ── Step 6: Done ──────────────────────────────────────────────────────
    await new Promise((r) => setTimeout(r, 400));
    updateLog('done', {
      status: 'done',
      text: txHash
        ? '🎉 NFT permanently on Polygon blockchain!'
        : '🎉 Simulation complete!',
      txHash,
    });

    setPhase('done');
  };

  const reset = () => {
    setPhase('idle');
    setLogs([]);
    progress.setValue(0);
    progressWidth.setValue(0);
    jeepX.setValue(0);
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.topSection, { paddingTop: insets.top, backgroundColor: isDark ? '#1E3A5F' : '#0A1628' }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>⛓️ Blockchain Demo</Text>
            <Text style={styles.headerSub}>Live simulation on Polygon Amoy</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Route Card ───────────────────────────────────────────────── */}
        <View style={[styles.routeCard, { backgroundColor: isDark ? theme.cardBackground : '#EFF6FF', borderColor: isDark ? theme.cardBorder : '#BFDBFE' }]}>
          <Text style={[styles.routeLabel, { color: theme.textSecondary }]}>SIMULATED ROUTE</Text>
          <View style={styles.routeRow}>
            <View style={styles.routeStop}>
              <View style={[styles.dot, { backgroundColor: '#10B981' }]} />
              <Text style={[styles.routeText, { color: theme.text }]}>{SIMULATED_RIDE.origin}</Text>
            </View>
            <Ionicons name="arrow-forward" size={16} color={theme.textSecondary} />
            <View style={styles.routeStop}>
              <View style={[styles.dot, { backgroundColor: '#EF4444' }]} />
              <Text style={[styles.routeText, { color: theme.text }]}>{SIMULATED_RIDE.destination}</Text>
            </View>
          </View>

          <View style={styles.routeMeta}>
            <Text style={[styles.metaChip, { color: isDark ? '#60A5FA' : '#1D4ED8', backgroundColor: isDark ? 'rgba(96,165,250,0.1)' : '#DBEAFE' }]}>
              📍 {SIMULATED_RIDE.distance} km
            </Text>
            <Text style={[styles.metaChip, { color: isDark ? '#34D399' : '#065F46', backgroundColor: isDark ? 'rgba(52,211,153,0.1)' : '#D1FAE5' }]}>
              ⭐ +{SIMULATED_RIDE.pointsEarned} pts
            </Text>
            <Text style={[styles.metaChip, { color: isDark ? '#A78BFA' : '#4C1D95', backgroundColor: isDark ? 'rgba(167,139,250,0.1)' : '#EDE9FE' }]}>
              🏅 Badge NFT
            </Text>
          </View>
        </View>

        {/* ── Progress Track ────────────────────────────────────────────── */}
        {phase !== 'idle' && (
          <View style={[styles.trackCard, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
            <View style={styles.trackLabels}>
              <Text style={[styles.trackLabel, { color: '#10B981' }]}>🟢 {SIMULATED_RIDE.origin}</Text>
              <Text style={[styles.trackLabel, { color: '#EF4444' }]}>🔴 {SIMULATED_RIDE.destination}</Text>
            </View>
            <View style={styles.trackBg}>
              <Animated.View
                style={[
                  styles.trackFill,
                  { width: progressWidth.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }
                ]}
              />
              <Animated.Text
                style={[
                  styles.jeep,
                  { left: jeepX.interpolate({ inputRange: [0, 1], outputRange: ['0%', '88%'] }) }
                ]}
              >
                🚌
              </Animated.Text>
            </View>
          </View>
        )}

        {/* ── Log Steps ─────────────────────────────────────────────────── */}
        {logs.length > 0 && (
          <View style={[styles.logsCard, { backgroundColor: isDark ? '#0A1628' : '#F8FAFC', borderColor: isDark ? '#1E3A5F' : '#E2E8F0' }]}>
            <Text style={[styles.logsTitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>BLOCKCHAIN LOG</Text>
            {logs.map((step) => <LogItem key={step.id} step={step} />)}
          </View>
        )}

        {/* ── User stats preview ────────────────────────────────────────── */}
        {phase === 'done' && (
          <View style={[styles.statsRow, { marginTop: 0 }]}>
            <View style={[styles.statCard, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
              <Text style={styles.statIcon}>⭐</Text>
              <Text style={[styles.statVal, { color: theme.text }]}>{user?.points || 0}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Total Points</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
              <Text style={styles.statIcon}>🏅</Text>
              <Text style={[styles.statVal, { color: theme.text }]}>{user?.badges?.length || 0}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Badges</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
              <Text style={styles.statIcon}>🚌</Text>
              <Text style={[styles.statVal, { color: theme.text }]}>{user?.total_trips || 0}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Trips</Text>
            </View>
          </View>
        )}

        {/* ── Contract Links ─────────────────────────────────────────────── */}
        <View style={[styles.linksCard, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
          <Text style={[styles.linksTitle, { color: theme.textSecondary }]}>🔗 VIEW ON BLOCKCHAIN</Text>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => Linking.openURL('https://amoy.polygonscan.com/address/0xB221491da91108eE52B6cC4E8325f8D99f536b16')}
          >
            <Text style={styles.linkText}>ParaBadge Contract (NFT mints)</Text>
            <Ionicons name="open-outline" size={14} color={COLORS.primary} />
          </TouchableOpacity>
          <View style={[styles.linkDivider, { backgroundColor: theme.cardBorder }]} />
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => Linking.openURL('https://amoy.polygonscan.com/address/0xE3AdA1Cd5F9F48b19dEd6712462b8Eb09aAa5198')}
          >
            <Text style={styles.linkText}>Treasury Wallet (pays gas)</Text>
            <Ionicons name="open-outline" size={14} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {/* ── Buttons ───────────────────────────────────────────────────── */}
        <View style={styles.btnRow}>
          {phase === 'idle' ? (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: COLORS.primary }]}
              activeOpacity={0.85}
              onPress={startSimulation}
            >
              <Ionicons name="play" size={20} color="#0A1628" />
              <Text style={styles.primaryBtnText}>START SIMULATION</Text>
            </TouchableOpacity>
          ) : phase === 'riding' ? (
            <View style={[styles.primaryBtn, { backgroundColor: isDark ? '#1E3A5F' : '#E5E7EB' }]}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={[styles.primaryBtnText, { color: theme.textSecondary }]}>SIMULATING...</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: '#10B981' }]}
              activeOpacity={0.85}
              onPress={reset}
            >
              <Ionicons name="refresh" size={20} color="#FFFFFF" />
              <Text style={[styles.primaryBtnText, { color: '#FFFFFF' }]}>RUN AGAIN</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1 },
  topSection: { backgroundColor: '#0A1628', zIndex: 10 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.screenX, paddingVertical: 14, height: 72,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontFamily: 'Cubao', fontSize: 20, color: '#FFFFFF', textAlign: 'center' },
  headerSub: { fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.55)', textAlign: 'center' },
  content: { paddingHorizontal: SPACING.screenX, paddingTop: 20, gap: 14 },

  routeCard: {
    borderRadius: RADIUS.card, borderWidth: 1, padding: 16, gap: 12,
  },
  routeLabel: { fontFamily: 'Inter', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeStop: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  routeText: { fontFamily: 'Inter', fontSize: 13, fontWeight: '600', flex: 1 },
  routeMeta: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  metaChip: {
    fontFamily: 'Inter', fontSize: 12, fontWeight: '600',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },

  trackCard: { borderRadius: RADIUS.card, borderWidth: 1, padding: 14, gap: 8 },
  trackLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  trackLabel: { fontFamily: 'Inter', fontSize: 11, fontWeight: '600' },
  trackBg: {
    height: 24, backgroundColor: 'rgba(10,22,40,0.08)', borderRadius: 12,
    overflow: 'visible', position: 'relative', justifyContent: 'center',
  },
  trackFill: {
    height: '100%', backgroundColor: COLORS.primary, borderRadius: 12, position: 'absolute',
  },
  jeep: { position: 'absolute', fontSize: 18, zIndex: 2 },

  logsCard: {
    borderRadius: RADIUS.card, borderWidth: 1, padding: 14, gap: 0,
  },
  logsTitle: { fontFamily: 'Inter', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 10 },
  logRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 7 },
  logIcon: { fontSize: 16, width: 22, textAlign: 'center', marginTop: 1 },
  logText: { fontFamily: 'Inter', fontSize: 13, lineHeight: 18 },
  txLink: { fontFamily: 'Inter', fontSize: 12, color: '#7C3AED', fontWeight: '600', marginTop: 2 },

  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, borderRadius: RADIUS.card, borderWidth: 1,
    padding: 12, alignItems: 'center', gap: 4,
  },
  statIcon: { fontSize: 22 },
  statVal: { fontFamily: 'Cubao', fontSize: 26 },
  statLabel: { fontFamily: 'Inter', fontSize: 11, fontWeight: '600' },

  linksCard: { borderRadius: RADIUS.card, borderWidth: 1, overflow: 'hidden' },
  linksTitle: {
    fontFamily: 'Inter', fontSize: 11, fontWeight: '700', letterSpacing: 1,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8,
  },
  linkRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  linkText: { fontFamily: 'Inter', fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  linkDivider: { height: 1, marginHorizontal: 14 },

  btnRow: { paddingBottom: 8 },
  primaryBtn: {
    height: 56, borderRadius: RADIUS.pill, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 5,
  },
  primaryBtnText: { fontFamily: 'Inter', fontSize: 15, fontWeight: '800', color: '#0A1628' },
});
