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
import { useGetContact, getGetContactQueryKey } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { OfflineBanner } from '@/components/OfflineBanner';

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function ContactDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const contactId = parseInt(id ?? '', 10);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isOnline = useNetworkStatus();

  const { data: contact, isLoading, isError } = useGetContact(contactId, {
    query: { enabled: !isNaN(contactId), queryKey: getGetContactQueryKey(contactId) },
  });

  if (isLoading && !contact) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!contact) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        {!isOnline && <OfflineBanner />}
        <Feather name="alert-circle" size={32} color={colors.mutedForeground} />
        <Text style={[styles.centerText, { color: colors.mutedForeground }]}>
          Contact not found
        </Text>
      </View>
    );
  }

  const isCustomer = contact.type === 'customer';

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      {!isOnline && <OfflineBanner stale />}
      {/* Hero */}
      <View
        style={[
          styles.hero,
          { backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <View
          style={[
            styles.avatarLarge,
            { backgroundColor: isCustomer ? colors.primary + '25' : colors.muted },
          ]}
        >
          <Text
            style={[
              styles.avatarText,
              { color: isCustomer ? colors.primary : colors.mutedForeground },
            ]}
          >
            {getInitials(contact.name)}
          </Text>
        </View>
        <Text style={[styles.contactName, { color: colors.foreground }]}>
          {contact.name}
        </Text>
        <View
          style={[
            styles.typeBadge,
            { backgroundColor: isCustomer ? '#22c55e25' : '#fb8c0425' },
          ]}
        >
          <Text
            style={[styles.typeText, { color: isCustomer ? '#22c55e' : '#fb8c04' }]}
          >
            {isCustomer ? 'Customer' : 'Lead'}
          </Text>
        </View>

        {isCustomer && (
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {contact.totalJobs ?? 0}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Jobs</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                $
                {(contact.totalSpent ?? 0).toLocaleString('en-US', {
                  maximumFractionDigits: 0,
                })}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                Total spent
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Contact info */}
      <View
        style={[
          styles.section,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <TouchableOpacity
          style={[styles.infoRow, { borderBottomColor: colors.border }]}
          onPress={() => Linking.openURL(`tel:${contact.phone}`)}
          activeOpacity={0.7}
        >
          <View style={[styles.iconBox, { backgroundColor: colors.primary + '20' }]}>
            <Feather name="phone" size={14} color={colors.primary} />
          </View>
          <View style={styles.infoContent}>
            <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Phone</Text>
            <Text style={[styles.infoValue, { color: colors.primary }]}>
              {contact.phone}
            </Text>
          </View>
          <Feather name="external-link" size={13} color={colors.primary} />
        </TouchableOpacity>

        {contact.email ? (
          <TouchableOpacity
            style={[styles.infoRow, { borderBottomColor: colors.border }]}
            onPress={() => Linking.openURL(`mailto:${contact.email}`)}
            activeOpacity={0.7}
          >
            <View style={[styles.iconBox, { backgroundColor: colors.muted }]}>
              <Feather name="mail" size={14} color={colors.mutedForeground} />
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>
                Email
              </Text>
              <Text style={[styles.infoValue, { color: colors.primary }]}>
                {contact.email}
              </Text>
            </View>
            <Feather name="external-link" size={13} color={colors.primary} />
          </TouchableOpacity>
        ) : null}

        {contact.address ? (
          <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
            <View style={[styles.iconBox, { backgroundColor: colors.muted }]}>
              <Feather name="map-pin" size={14} color={colors.mutedForeground} />
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>
                Address
              </Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>
                {contact.address}
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* Notes */}
      {contact.notes ? (
        <View
          style={[
            styles.notesCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.notesLabel, { color: colors.mutedForeground }]}>Notes</Text>
          <Text style={[styles.notesText, { color: colors.foreground }]}>
            {contact.notes}
          </Text>
        </View>
      ) : null}

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.primary }]}
          onPress={() => Linking.openURL(`tel:${contact.phone}`)}
          activeOpacity={0.8}
        >
          <Feather name="phone" size={18} color="#fff" />
          <Text style={styles.actionBtnText}>Call</Text>
        </TouchableOpacity>
        {contact.email ? (
          <TouchableOpacity
            style={[
              styles.actionBtn,
              {
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
              },
            ]}
            onPress={() => Linking.openURL(`mailto:${contact.email}`)}
            activeOpacity={0.8}
          >
            <Feather name="mail" size={18} color={colors.foreground} />
            <Text style={[styles.actionBtnText, { color: colors.foreground }]}>Email</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  centerText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  hero: {
    padding: 24,
    paddingTop: 28,
    alignItems: 'center',
    borderBottomWidth: 1,
    gap: 8,
  },
  avatarLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarText: { fontSize: 26, fontFamily: 'Inter_700Bold' },
  contactName: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.3,
  },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  typeText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 28,
  },
  stat: { alignItems: 'center', gap: 2 },
  statValue: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  statDivider: { width: 1, height: 32 },
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
  iconBox: {
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
  actions: {
    flexDirection: 'row',
    gap: 10,
    margin: 16,
    marginTop: 24,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
  },
  actionBtnText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
  },
});
