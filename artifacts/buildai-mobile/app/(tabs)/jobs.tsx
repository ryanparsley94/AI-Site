import React from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Platform,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGetUpcomingJobs } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';

const JOB_STATUS_COLORS: Record<string, string> = {
  scheduled: '#fb8c04',
  in_progress: '#3b82f6',
  completed: '#22c55e',
  cancelled: '#94a3b8',
};

const JOB_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

type Job = {
  id: number;
  title: string;
  status: string;
  scheduledAt: string;
  contactName: string;
  serviceType: string;
  address?: string | null;
  estimatedDuration?: number | null;
};

function JobCard({ job }: { job: Job }) {
  const colors = useColors();
  const statusColor = JOB_STATUS_COLORS[job.status] ?? '#94a3b8';
  const statusLabel = JOB_STATUS_LABELS[job.status] ?? job.status;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => router.push(`/job/${job.id}`)}
      activeOpacity={0.7}
    >
      <View style={[styles.statusBar, { backgroundColor: statusColor }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text
            style={[styles.jobTitle, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {job.title}
          </Text>
          <View style={[styles.badge, { backgroundColor: statusColor + '25' }]}>
            <Text style={[styles.badgeText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          <Feather name="clock" size={12} color={colors.mutedForeground} />
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
            {formatDate(job.scheduledAt)} · {formatTime(job.scheduledAt)}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Feather name="tool" size={12} color={colors.mutedForeground} />
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
            {job.serviceType}
            {job.estimatedDuration ? ` · ${job.estimatedDuration} min` : ''}
          </Text>
        </View>
        {job.address ? (
          <View style={styles.metaRow}>
            <Feather name="map-pin" size={12} color={colors.mutedForeground} />
            <Text
              style={[styles.metaText, { color: colors.mutedForeground }]}
              numberOfLines={1}
            >
              {job.address}
            </Text>
          </View>
        ) : null}
        <View style={styles.metaRow}>
          <Feather name="user" size={12} color={colors.mutedForeground} />
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
            {job.contactName}
          </Text>
        </View>
      </View>
      <Feather
        name="chevron-right"
        size={16}
        color={colors.mutedForeground}
        style={{ marginRight: 12 }}
      />
    </TouchableOpacity>
  );
}

export default function JobsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 34 : insets.bottom;

  const { data: jobs, isLoading, isError, refetch } = useGetUpcomingJobs();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: topPadding + 20,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Upcoming Jobs</Text>
        <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>Next 7 days</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 60 }} />
      ) : isError ? (
        <View style={styles.center}>
          <Feather name="alert-circle" size={32} color={colors.mutedForeground} />
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
            Couldn't load jobs
          </Text>
          <TouchableOpacity onPress={() => refetch()} activeOpacity={0.7}>
            <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={jobs ?? []}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => <JobCard job={item} />}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: bottomPadding + 90,
          }}
          scrollEnabled={!!(jobs?.length)}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View
              style={[
                styles.empty,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Feather name="calendar" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                No upcoming jobs
              </Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Jobs scheduled in the next 7 days appear here
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  errorText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  retryText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  empty: {
    padding: 40,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 5,
    borderWidth: 1,
    marginBottom: 10,
    overflow: 'hidden',
  },
  statusBar: { width: 4, alignSelf: 'stretch' },
  cardBody: { flex: 1, padding: 14, gap: 5 },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  jobTitle: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    flex: 1,
    marginRight: 8,
  },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  badgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12, fontFamily: 'Inter_400Regular', flex: 1 },
});
