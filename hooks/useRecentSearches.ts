import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'para_recent_searches';
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

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          setRecents(JSON.parse(raw));
        } catch {
          // corrupted – ignore
        }
      }
    });
  }, []);

  const addRecent = useCallback(
    (item: Omit<RecentSearch, 'timestamp'>) => {
      setRecents((prev) => {
        const filtered = prev.filter((r) => r.id !== item.id);
        const next = [{ ...item, timestamp: Date.now() }, ...filtered].slice(0, MAX_RECENT);
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    [],
  );

  const clearRecents = useCallback(() => {
    setRecents([]);
    AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  return { recents, addRecent, clearRecents };
}
