import React from 'react';
import {
  View,
  Image,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGetDashboardSummary, useGetUpcomingJobs } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { OfflineBanner } from '@/components/OfflineBanner';

const JOB_STATUS_COLORS: Record<string, string> = {
  scheduled: '#36C6D5',
  in_progress: '#3b82f6',
  completed: '#22c55e',
  cancelled: '#94a3b8',
};

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

type StatTileProps = {
  label: string;
  value: string | number;
  icon: React.ComponentProps<typeof Feather>['name'];
  accent?: boolean;
};

function StatTile({ label, value, icon, accent }: StatTileProps) {
  const colors = useColors();
  return (
    <View style={[styles.statTile, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View
        style={[
          styles.statIconBox,
          { backgroundColor: accent ? colors.primary + '25' : colors.muted },
        ]}
      >
        <Feather name={icon} size={15} color={accent ? colors.primary : colors.mutedForeground} />
      </View>
      <Text style={[styles.statValue, { color: accent ? colors.primary : colors.foreground }]}>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 34 : insets.bottom;
  const isOnline = useNetworkStatus();

  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
    refetch: refetchSummary,
  } = useGetDashboardSummary();
  const {
    data: upcomingJobs,
    isLoading: jobsLoading,
    isError: jobsError,
    refetch: refetchJobs,
  } = useGetUpcomingJobs();

  const isLoading = summaryLoading || jobsLoading;
  // Only show error UI when offline AND there's no cached data to display
  const hasError = (summaryError || jobsError) && !summary && !upcomingJobs;
  const showOfflineBanner = !isOnline && (!!summary || !!upcomingJobs);
  const previewJobs = upcomingJobs?.slice(0, 3) ?? [];

  function refetchAll() {
    refetchSummary();
    refetchJobs();
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {showOfflineBanner && <OfflineBanner stale />}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPadding + 90 }}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetchAll}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: topPadding + 20 }]}>
          <View>
            <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
              {getGreeting()} · FIELD
            </Text>
            <Image
              source={require('../../assets/images/crewon-wordmark.png')}
              accessibilityLabel="CREWON"
              resizeMode="contain"
              style={{ width: 164, height: 67 }}
            />
            <Text style={{ color: colors.mutedForeground, fontSize: 9, letterSpacing: 1.2, marginTop: 4 }}>
              YOUR CREW. SWITCHED ON.
            </Text>
          </View>
          <View style={[styles.amberDot, { backgroundColor: colors.primary }]} />
        </View>

        <View style={styles.content}>
          {isLoading && !summary ? (
            <ActivityIndicator
              color={colors.primary}
              size="large"
              style={{ marginTop: 40 }}
            />
          ) : hasError ? (
            <View style={styles.center}>
              <Feather name="wifi-off" size={32} color={colors.mutedForeground} />
              <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
                No connection
              </Text>
              <TouchableOpacity onPress={refetchAll} activeOpacity={0.7}>
                <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Stat grid */}
              <View style={styles.statGrid}>
                <StatTile
                  label="Jobs this week"
                  value={summary?.jobsThisWeek ?? 0}
                  icon="briefcase"
                  accent
                />
                <StatTile
                  label="Calls today"
                  value={summary?.callsToday ?? 0}
                  icon="phone"
                />
                <StatTile
                  label="Missed calls"
                  value={summary?.missedCallsToday ?? 0}
                  icon="phone-missed"
                />
                <StatTile
                  label="Booking rate"
                  value={summary ? `${Math.round(summary.bookingRate)}%` : '0%'}
                  icon="trending-up"
                  accent
                />
              </View>

              {/* Revenue card */}
              <View
                style={[
                  styles.revenueCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={styles.revenueLeft}>
                  <Text style={[styles.revenueLabel, { color: colors.mutedForeground }]}>
                    Revenue this month
                  </Text>
                  <Text style={[styles.revenueValue, { color: colors.foreground }]}>
                    $
                    {(summary?.revenueThisMonth ?? 0).toLocaleString('en-US', {
                      maximumFractionDigits: 0,
                    })}
                  </Text>
                </View>
                <View
                  style={[
                    styles.revenueIconBox,
                    { backgroundColor: colors.primary + '25' },
                  ]}
                >
                  <Feather name="dollar-sign" size={22} color={colors.primary} />
                </View>
              </View>

              {/* Upcoming Jobs section */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                    Upcoming Jobs
                  </Text>
                  <TouchableOpacity
                    onPress={() => router.push('/(tabs)/jobs')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.sectionLink, { color: colors.primary }]}>View all</Text>
                  </TouchableOpacity>
                </View>

                {previewJobs.length === 0 ? (
                  <View
                    style={[
                      styles.emptyCard,
                      { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                  >
                    <Feather name="calendar" size={24} color={colors.mutedForeground} />
                    <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                      No upcoming jobs
                    </Text>
                  </View>
                ) : (
                  previewJobs.map((job) => {
                    const statusColor =
                      JOB_STATUS_COLORS[job.status] ?? '#94a3b8';
                    return (
                      <TouchableOpacity
                        key={job.id}
                        style={[
                          styles.jobCard,
                          { backgroundColor: colors.card, borderColor: colors.border },
                        ]}
                        onPress={() => router.push(`/job/${job.id}`)}
                        activeOpacity={0.7}
                      >
                        <View
                          style={[styles.jobStatusBar, { backgroundColor: statusColor }]}
                        />
                        <View style={styles.jobCardContent}>
                          <Text
                            style={[styles.jobTitle, { color: colors.foreground }]}
                            numberOfLines={1}
                          >
                            {job.title}
                          </Text>
                          <Text
                            style={[styles.jobMeta, { color: colors.mutedForeground }]}
                            numberOfLines={1}
                          >
                            {formatTime(job.scheduledAt)} · {job.serviceType}
                          </Text>
                          {job.address ? (
                            <Text
                              style={[styles.jobAddress, { color: colors.mutedForeground }]}
                              numberOfLines={1}
                            >
                              {job.address}
                            </Text>
                          ) : null}
                        </View>
                        <Feather
                          name="chevron-right"
                          size={16}
                          color={colors.mutedForeground}
                          style={{ marginRight: 12 }}
                        />
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greeting: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  amberDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  content: { paddingHorizontal: 16 },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  statTile: {
    width: '47%',
    padding: 16,
    borderRadius: 5,
    borderWidth: 1,
  },
  statIconBox: {
    width: 30,
    height: 30,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  statValue: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    marginBottom: 3,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  revenueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 5,
    borderWidth: 1,
    marginBottom: 24,
  },
  revenueLeft: { flex: 1 },
  revenueLabel: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginBottom: 4,
  },
  revenueValue: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
  },
  revenueIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  sectionLink: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  emptyCard: {
    padding: 32,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  jobCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 5,
    borderWidth: 1,
    marginBottom: 8,
    overflow: 'hidden',
  },
  jobStatusBar: {
    width: 4,
    alignSelf: 'stretch',
  },
  jobCardContent: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 3,
  },
  jobTitle: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  jobMeta: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  jobAddress: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingTop: 80,
  },
  errorText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  retryText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
