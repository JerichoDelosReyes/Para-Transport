import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStore } from '../store/useStore';

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
  const user = useStore((state) => state.user);
  const storageKey = `para_recent_searches_${user?.id || 'guest'}`;

  const [recents, setRecents] = useState<RecentSearch[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(storageKey).then((raw) => {
      if (raw) {
        try {
          setRecents(JSON.parse(raw));
        } catch {
          // corrupted – ignore
        }
      } else {
        setRecents([]); // Reset when storage key changes
      }
    });
  }, [storageKey]);

  const addRecent = useCallback(
    (item: Omit<RecentSearch, 'timestamp'>) => {
      setRecents((prev) => {
        const filtered = prev.filter((r) => r.id !== item.id);
        const next = [{ ...item, timestamp: Date.now() }, ...filtered].slice(0, MAX_RECENT);
        AsyncStorage.setItem(storageKey, JSON.stringify(next));
        return next;
      });
    },
    [storageKey],
  );

  const clearRecents = useCallback(() => {
    setRecents([]);
    AsyncStorage.removeItem(storageKey);
  }, [storageKey]);

  return { recents, addRecent, clearRecents };
}
