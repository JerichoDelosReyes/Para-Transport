import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';
import { supabase } from '../config/supabaseClient';
import { useStore } from '../store/useStore';

type BroadcastMessage = {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'alert' | 'critical';
  is_active: boolean;
};

const windowWidth = Dimensions.get('window').width;

export function GlobalBroadcast() {
  const insets = useSafeAreaInsets();
  const dismissedBroadcasts = useStore((state) => state.dismissedBroadcasts);
  const dismissBroadcastStore = useStore((state) => state.dismissBroadcast);
  const sessionMode = useStore((state) => state.sessionMode);
  const [broadcasts, setBroadcasts] = useState<BroadcastMessage[]>([]);
  const [activeBroadcast, setActiveBroadcast] = useState<BroadcastMessage | null>(null);
  const slideAnim = useRef(new Animated.Value(-150)).current; // Slide down from top

  // Automatically fetch active broadcasts and listen
  useEffect(() => {
    let unmounted = false;

    const fetchBroadcasts = async () => {
      const { data } = await supabase
        .from('broadcasts')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      
      if (!unmounted && data && data.length > 0) {
        // Filter out those already dismissed
        const unseenBroadcasts = data.filter((b) => !dismissedBroadcasts.includes(b.id));
        setBroadcasts(unseenBroadcasts);
      }
    };

    fetchBroadcasts();

    const channel = supabase.channel('realtime_broadcasts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'broadcasts' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newBcast = payload.new as BroadcastMessage;
            if (newBcast.is_active && !dismissedBroadcasts.includes(newBcast.id)) {
              setBroadcasts((prev) => [newBcast, ...prev]);
            }
          } else if (payload.eventType === 'UPDATE') {
            const upd = payload.new as BroadcastMessage;
            if (!upd.is_active) {
              setBroadcasts((prev) => prev.filter((b) => b.id !== upd.id));
              if (activeBroadcast?.id === upd.id) dismissCurrent();
            } else {
              setBroadcasts((prev) => {
                const copy = [...prev];
                const idx = copy.findIndex((b) => b.id === upd.id);
                if (idx !== -1) copy[idx] = upd;
                else copy.unshift(upd);
                return copy;
              });
            }
          } else if (payload.eventType === 'DELETE') {
            const del = payload.old as { id: string };
            setBroadcasts((prev) => prev.filter((b) => b.id !== del.id));
            if (activeBroadcast?.id === del.id) dismissCurrent();
          }
        }
      )
      .subscribe();

    return () => {
      unmounted = true;
      supabase.removeChannel(channel);
    };
  }, [activeBroadcast, dismissedBroadcasts]);

  // Show logic
  useEffect(() => {
    if (!sessionMode) {
      if (activeBroadcast) dismissCurrent();
      return;
    }

    if (!activeBroadcast && broadcasts.length > 0) {
      // Pick first only if user is actively in session (logged in/guest mode)
      setActiveBroadcast(broadcasts[0]);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start();
    } else if (activeBroadcast && broadcasts.findIndex(b => b.id === activeBroadcast.id) === -1) {
      // Current one was removed
      dismissCurrent();
    }
  }, [broadcasts, activeBroadcast, sessionMode]);

  const handleUserDismiss = () => {
    if (activeBroadcast) {
      dismissBroadcastStore(activeBroadcast.id);
    }
    dismissCurrent();
  };

  const dismissCurrent = () => {
    Animated.timing(slideAnim, {
      toValue: -150,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      if (activeBroadcast) {
        setBroadcasts(prev => prev.filter(b => b.id !== activeBroadcast.id));
        setActiveBroadcast(null);
      }
    });
  };

  if (!activeBroadcast) return null;

  const bgColors: Record<string, string> = {
    info: 'rgba(10, 34, 64, 0.6)', // COLORS.navy with opacity
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
    <Animated.View
      style={[
        styles.bannerContainer,
        {
          transform: [{ translateY: slideAnim }],
        },
      ]}
      pointerEvents="box-none"
    >
      <BlurView 
        intensity={40} 
        tint="dark" 
        style={[
          styles.glassBackground, 
          { 
            backgroundColor: bgColors[activeBroadcast.type] || bgColors.info,
            paddingTop: Math.max(insets.top, 10) + 10,
          }
        ]}
      >
        <View style={styles.contentRow} pointerEvents="auto">
          {activeBroadcast.type === 'critical' ? (
            <Text style={[styles.icon, { color: '#FFF', fontSize: 28, fontWeight: '900', width: 28, textAlign: 'center' }]}>!!</Text>
          ) : (
            <Ionicons name={icons[activeBroadcast.type] as any} size={28} color="#FFF" style={styles.icon} />
          )}
          <View style={styles.textContainer}>
            <Text style={styles.title}>{activeBroadcast.title}</Text>
            <Text style={styles.message}>{activeBroadcast.message}</Text>
          </View>
          <TouchableOpacity onPress={handleUserDismiss} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>
      </BlurView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bannerContainer: {
    position: 'absolute',
    top: 0,
    width: windowWidth,
    zIndex: 99999,
  },
  glassBackground: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingHorizontal: 16,
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  icon: {
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    marginRight: 10,
  },
  title: {
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: 16,
    color: '#FFF',
    marginBottom: 4,
  },
  message: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 20,
  },
  closeButton: {
    padding: 4,
  },
});