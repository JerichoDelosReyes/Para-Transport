import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';
import { supabase } from '../config/supabaseClient';

type BroadcastMessage = {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'alert';
  is_active: boolean;
};

const windowWidth = Dimensions.get('window').width;

export function GlobalBroadcast() {
  const insets = useSafeAreaInsets();
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
        setBroadcasts(data);
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
            if (newBcast.is_active) {
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
  }, [activeBroadcast]);

  // Show logic
  useEffect(() => {
    if (!activeBroadcast && broadcasts.length > 0) {
      // Pick first
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
  }, [broadcasts, activeBroadcast]);

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

  const bgColors = {
    info: COLORS.primaryDark,
    warning: '#F59E0B',
    alert: '#EF4444',
  };

  const icons = {
    info: 'information-circle',
    warning: 'warning',
    alert: 'alert-circle',
  };

  return (
    <Animated.View
      style={[
        styles.bannerContainer,
        {
          transform: [{ translateY: slideAnim }],
          backgroundColor: bgColors[activeBroadcast.type] || bgColors.info,
          paddingTop: Math.max(insets.top, 10) + 10,
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.contentRow} pointerEvents="auto">
        <Ionicons name={icons[activeBroadcast.type] as any} size={28} color="#FFF" style={styles.icon} />
        <View style={styles.textContainer}>
          <Text style={styles.title}>{activeBroadcast.title}</Text>
          <Text style={styles.message}>{activeBroadcast.message}</Text>
        </View>
        <TouchableOpacity onPress={dismissCurrent} style={styles.closeButton}>
          <Ionicons name="close" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bannerContainer: {
    position: 'absolute',
    top: 0,
    width: windowWidth,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 99999,
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