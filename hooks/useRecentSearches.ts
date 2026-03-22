import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabaseClient';
import { useStore } from '../store/useStore';

const LOCAL_KEY = 'para_recent_searches';
const MAX_RECENT = 15;

export type RecentSearch = {
  id: string;
  title: string;
  subtitle: string;
  latitude: number;
  longitude: number;
  timestamp: number;
};

export function useRecentSearches() {
  const [recents, setRecents] = useState<RecentSearch[]>([]);
  const sessionMode = useStore((s) => s.sessionMode);
  const userIdRef = useRef<string | null>(null);

  // Resolve the Supabase auth user id once
  useEffect(() => {
    if (sessionMode !== 'auth') {
      userIdRef.current = null;
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      userIdRef.current = data.session?.user?.id ?? null;
    });
  }, [sessionMode]);

  // Load recents on mount / session change
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (sessionMode === 'auth') {
        const { data: session } = await supabase.auth.getSession();
        const uid = session.session?.user?.id;
        if (!uid || cancelled) return;
        userIdRef.current = uid;

        const { data, error } = await supabase
          .from('recent_searches')
          .select('place_id, title, subtitle, latitude, longitude, searched_at')
          .eq('user_id', uid)
          .order('searched_at', { ascending: false })
          .limit(MAX_RECENT);

        if (!error && data && !cancelled) {
          setRecents(
            data.map((row: any) => ({
              id: row.place_id,
              title: row.title,
              subtitle: row.subtitle ?? '',
              latitude: Number(row.latitude),
              longitude: Number(row.longitude),
              timestamp: new Date(row.searched_at).getTime(),
            })),
          );
        }
      } else {
        // Guest / no session — use local storage
        const raw = await AsyncStorage.getItem(LOCAL_KEY);
        if (raw && !cancelled) {
          try { setRecents(JSON.parse(raw)); } catch { /* corrupted */ }
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [sessionMode]);

  const addRecent = useCallback(
    (item: Omit<RecentSearch, 'timestamp'>) => {
      const now = Date.now();

      setRecents((prev) => {
        const filtered = prev.filter((r) => r.id !== item.id);
        return [{ ...item, timestamp: now }, ...filtered].slice(0, MAX_RECENT);
      });

      const uid = userIdRef.current;
      if (uid) {
        supabase
          .from('recent_searches')
          .upsert(
            {
              user_id: uid,
              place_id: item.id,
              title: item.title,
              subtitle: item.subtitle,
              latitude: item.latitude,
              longitude: item.longitude,
              searched_at: new Date(now).toISOString(),
            },
            { onConflict: 'user_id,place_id' },
          )
          .then(); // fire-and-forget
      } else {
        // Guest — persist locally
        setRecents((cur) => {
          AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(cur));
          return cur;
        });
      }
    },
    [],
  );

  const clearRecents = useCallback(() => {
    setRecents([]);

    const uid = userIdRef.current;
    if (uid) {
      supabase
        .from('recent_searches')
        .delete()
        .eq('user_id', uid)
        .then();
    } else {
      AsyncStorage.removeItem(LOCAL_KEY);
    }
  }, []);

  return { recents, addRecent, clearRecents };
}
