import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

/**
 * A slim amber banner shown at the top of a screen when the device is offline.
 * Pass `stale` to indicate data is from cache; omit or set false for a plain
 * "no connection" message.
 */
export function OfflineBanner({ stale = false }: { stale?: boolean }) {
  return (
    <View style={styles.banner}>
      <Feather name="wifi-off" size={13} color="#92400e" />
      <Text style={styles.text}>
        {stale ? 'Offline — showing cached data' : 'No internet connection'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 16,
    backgroundColor: '#fef3c7',
  },
  text: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: '#92400e',
  },
});
