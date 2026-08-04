import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

/**
 * Returns true when the device has an internet connection.
 * Starts as `true` (optimistic) until the first NetInfo event fires.
 */
export function useNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Fetch current state immediately
    NetInfo.fetch().then((state) => {
      setIsOnline(state.isConnected !== false);
    });

    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected !== false);
    });

    return unsubscribe;
  }, []);

  return isOnline;
}
