import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useGetCertificate, getGetCertificateQueryKey } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { OfflineBanner } from '@/components/OfflineBanner';

const CERT_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  completion: { label: 'Completion Certificate', color: '#22c55e' },
  safety: { label: 'Safety Certificate', color: '#ef4444' },
  warranty: { label: 'Warranty Document', color: '#3b82f6' },
  lien_waiver: { label: 'Lien Waiver', color: '#36C6D5' },
  subcontractor_agreement: { label: 'Subcontractor Agreement', color: '#a855f7' },
};

export default function CertificateDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const certId = parseInt(id ?? '', 10);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isOnline = useNetworkStatus();

  const { data: cert, isLoading, isError } = useGetCertificate(certId, {
    query: { enabled: !isNaN(certId), queryKey: getGetCertificateQueryKey(certId) },
  });

  if (isLoading && !cert) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!cert) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        {!isOnline && <OfflineBanner />}
        <Feather name="alert-circle" size={32} color={colors.mutedForeground} />
        <Text style={[styles.centerText, { color: colors.mutedForeground }]}>
          Certificate not found
        </Text>
      </View>
    );
  }

  const config = CERT_TYPE_CONFIG[cert.type] ?? { label: cert.type, color: '#94a3b8' };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      {!isOnline && <OfflineBanner stale />}
      {/* Header card */}
      <View
        style={[
          styles.headerCard,
          { backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <View style={[styles.typeIconBox, { backgroundColor: config.color + '20' }]}>
          <Feather name="award" size={24} color={config.color} />
        </View>
        <View style={[styles.typeBadge, { backgroundColor: config.color + '20' }]}>
          <Text style={[styles.typeText, { color: config.color }]}>{config.label}</Text>
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>{cert.title}</Text>

        <View style={styles.meta}>
          {cert.jobTitle ? (
            <View style={styles.metaRow}>
              <Feather name="briefcase" size={13} color={colors.mutedForeground} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                {cert.jobTitle}
              </Text>
            </View>
          ) : null}
          <View style={styles.metaRow}>
            <Feather name="calendar" size={13} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
              {new Date(cert.createdAt).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </Text>
          </View>
        </View>
      </View>

      {/* Document content */}
      <View
        style={[
          styles.contentCard,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={styles.contentHeader}>
          <Feather name="file-text" size={14} color={colors.mutedForeground} />
          <Text style={[styles.contentLabel, { color: colors.mutedForeground }]}>
            Document
          </Text>
        </View>
        <Text style={[styles.content, { color: colors.foreground }]}>{cert.content}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  centerText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  headerCard: {
    padding: 20,
    paddingTop: 24,
    borderBottomWidth: 1,
    gap: 8,
  },
  typeIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  title: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.3,
  },
  meta: { gap: 6, marginTop: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  contentCard: {
    margin: 16,
    borderRadius: 5,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  contentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  contentLabel: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  content: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 22,
  },
});
