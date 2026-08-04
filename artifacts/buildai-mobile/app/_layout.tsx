import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { setBaseUrl } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

// Prevent splash screen from auto-hiding before fonts are loaded.
SplashScreen.preventAutoHideAsync();

// Set the API base URL once at module load — must be absolute for Expo bundles
// which run outside the shared proxy.
if (process.env.EXPO_PUBLIC_DOMAIN) {
  setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);
}

// Wire React Query's online manager to NetInfo so queries pause/resume
// automatically when connectivity changes.
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(state.isConnected !== false);
  });
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep data in cache for 24 h so it survives offline periods
      gcTime: 1000 * 60 * 60 * 24,
      // Consider data fresh for 5 min to reduce unnecessary refetches
      staleTime: 1000 * 60 * 5,
      // Retry once on error; avoids hammering a server that is reachable but slow
      retry: 1,
    },
  },
});

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'buildai-query-cache',
});

function RootLayoutNav() {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.primary,
        headerTitleStyle: {
          fontFamily: 'Inter_600SemiBold',
          color: colors.foreground,
          fontSize: 17,
        },
        headerShadowVisible: false,
        headerBackTitle: 'Back',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="job/[id]" options={{ title: 'Job Details' }} />
      <Stack.Screen name="contact/[id]" options={{ title: 'Contact' }} />
      <Stack.Screen name="certificate/[id]" options={{ title: 'Certificate' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister: asyncStoragePersister }}
        >
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <RootLayoutNav />
            </KeyboardProvider>
          </GestureHandlerRootView>
        </PersistQueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
