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
import { useListCertificates } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';

const CERT_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  completion: { label: 'Completion', color: '#22c55e' },
  safety: { label: 'Safety', color: '#ef4444' },
  warranty: { label: 'Warranty', color: '#3b82f6' },
  lien_waiver: { label: 'Lien Waiver', color: '#fb8c04' },
  subcontractor_agreement: { label: 'Subcontractor', color: '#a855f7' },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

type Certificate = {
  id: number;
  type: string;
  title: string;
  jobTitle?: string | null;
  createdAt: string;
};

function CertCard({ cert }: { cert: Certificate }) {
  const colors = useColors();
  const config = CERT_TYPE_CONFIG[cert.type] ?? { label: cert.type, color: '#94a3b8' };

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => router.push(`/certificate/${cert.id}`)}
      activeOpacity={0.7}
    >
      <View style={[styles.iconBox, { backgroundColor: config.color + '20' }]}>
        <Feather name="file-text" size={20} color={config.color} />
      </View>
      <View style={styles.cardBody}>
        <View style={[styles.badge, { backgroundColor: config.color + '20' }]}>
          <Text style={[styles.badgeText, { color: config.color }]}>{config.label}</Text>
        </View>
        <Text
          style={[styles.certTitle, { color: colors.foreground }]}
          numberOfLines={2}
        >
          {cert.title}
        </Text>
        {cert.jobTitle ? (
          <Text
            style={[styles.jobRef, { color: colors.mutedForeground }]}
            numberOfLines={1}
          >
            {cert.jobTitle}
          </Text>
        ) : null}
        <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
          {formatDate(cert.createdAt)}
        </Text>
      </View>
      <Feather
        name="chevron-right"
        size={16}
        color={colors.mutedForeground}
      />
    </TouchableOpacity>
  );
}

export default function CertificatesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 34 : insets.bottom;

  const { data: certs, isLoading, isError, refetch } = useListCertificates();

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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Certificates</Text>
        <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
          {certs
            ? `${certs.length} document${certs.length !== 1 ? 's' : ''}`
            : 'Saved documents'}
        </Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 60 }} />
      ) : isError ? (
        <View style={styles.center}>
          <Feather name="alert-circle" size={32} color={colors.mutedForeground} />
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
            Couldn't load certificates
          </Text>
          <TouchableOpacity onPress={() => refetch()} activeOpacity={0.7}>
            <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={certs ?? []}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => <CertCard cert={item} />}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: bottomPadding + 90,
          }}
          scrollEnabled={!!(certs?.length)}
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
              <Feather name="file-text" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                No certificates
              </Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Generate certificates from the web app
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
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
    padding: 14,
    borderRadius: 5,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  cardBody: { flex: 1, gap: 4 },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginBottom: 2,
  },
  badgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  certTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  jobRef: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  dateText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
});
