import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useGetJob, getGetJobQueryKey } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { OfflineBanner } from '@/components/OfflineBanner';

const JOB_STATUS_COLORS: Record<string, string> = {
  scheduled: '#36C6D5',
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

type InfoRowProps = {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  value: string;
  onPress?: () => void;
};

function InfoRow({ icon, label, value, onPress }: InfoRowProps) {
  const colors = useColors();
  return (
    <TouchableOpacity
      style={[styles.infoRow, { borderBottomColor: colors.border }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      <View style={[styles.infoIconBox, { backgroundColor: colors.muted }]}>
        <Feather name={icon} size={14} color={colors.mutedForeground} />
      </View>
      <View style={styles.infoContent}>
        <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
        <Text
          style={[styles.infoValue, { color: onPress ? colors.primary : colors.foreground }]}
        >
          {value}
        </Text>
      </View>
      {onPress ? (
        <Feather name="external-link" size={13} color={colors.primary} />
      ) : null}
    </TouchableOpacity>
  );
}

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const jobId = parseInt(id ?? '', 10);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isOnline = useNetworkStatus();

  const { data: job, isLoading, isError } = useGetJob(jobId, {
    query: { enabled: !isNaN(jobId), queryKey: getGetJobQueryKey(jobId) },
  });

  if (isLoading && !job) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  // Show error only when offline AND no cached data, or online with a real error and no data
  if ((isError || !job) && !job) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        {!isOnline && <OfflineBanner />}
        <Feather name="alert-circle" size={32} color={colors.mutedForeground} />
        <Text style={[styles.centerText, { color: colors.mutedForeground }]}>
          Job not found
        </Text>
      </View>
    );
  }

  const statusColor = JOB_STATUS_COLORS[job!.status] ?? '#94a3b8';
  const statusLabel = JOB_STATUS_LABELS[job!.status] ?? job!.status;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      {!isOnline && <OfflineBanner stale />}
      {/* Hero section */}
      <View
        style={[
          styles.hero,
          { backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <View style={[styles.statusPill, { backgroundColor: statusColor + '20' }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
        <Text style={[styles.jobTitle, { color: colors.foreground }]}>{job.title}</Text>
        <Text style={[styles.serviceType, { color: colors.mutedForeground }]}>
          {job.serviceType}
        </Text>
        {job.estimatedValue ? (
          <View style={[styles.valueBadge, { backgroundColor: colors.primary + '20' }]}>
            <Text style={[styles.valueText, { color: colors.primary }]}>
              ${job.estimatedValue.toLocaleString('en-US')} estimated value
            </Text>
          </View>
        ) : null}
      </View>

      {/* Info rows */}
      <View
        style={[
          styles.section,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <InfoRow
          icon="calendar"
          label="Scheduled"
          value={new Date(job.scheduledAt).toLocaleString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          })}
        />
        {job.estimatedDuration ? (
          <InfoRow
            icon="clock"
            label="Duration"
            value={`${job.estimatedDuration} minutes`}
          />
        ) : null}
        <InfoRow icon="user" label="Contact" value={job.contactName} />
        <InfoRow
          icon="phone"
          label="Phone"
          value={job.contactPhone}
          onPress={() => Linking.openURL(`tel:${job.contactPhone}`)}
        />
        {job.address ? (
          <InfoRow icon="map-pin" label="Address" value={job.address} />
        ) : null}
      </View>

      {/* Description */}
      {job.description ? (
        <View
          style={[
            styles.notesCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.notesLabel, { color: colors.mutedForeground }]}>
            Description
          </Text>
          <Text style={[styles.notesText, { color: colors.foreground }]}>
            {job.description}
          </Text>
        </View>
      ) : null}

      {/* Notes */}
      {job.notes ? (
        <View
          style={[
            styles.notesCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.notesLabel, { color: colors.mutedForeground }]}>Notes</Text>
          <Text style={[styles.notesText, { color: colors.foreground }]}>{job.notes}</Text>
        </View>
      ) : null}

      {/* Call CTA */}
      <View style={styles.cta}>
        <TouchableOpacity
          style={[styles.callButton, { backgroundColor: colors.primary }]}
          onPress={() => Linking.openURL(`tel:${job.contactPhone}`)}
          activeOpacity={0.8}
        >
          <Feather name="phone" size={18} color="#fff" />
          <Text style={styles.callButtonText}>Call {job.contactName}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  centerText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  hero: {
    padding: 20,
    paddingTop: 24,
    borderBottomWidth: 1,
    gap: 6,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 6,
    marginBottom: 4,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  jobTitle: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.3,
  },
  serviceType: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  valueBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4,
  },
  valueText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  section: {
    marginTop: 12,
    marginHorizontal: 16,
    borderRadius: 5,
    borderWidth: 1,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContent: { flex: 1, gap: 2 },
  infoLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  notesCard: {
    marginTop: 12,
    marginHorizontal: 16,
    borderRadius: 5,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  notesLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  notesText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
  },
  cta: { margin: 16, marginTop: 24 },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
  },
  callButtonText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
  },
});
