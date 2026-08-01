import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Platform,
  TouchableOpacity,
  TextInput,
  Linking,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useListContacts } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

type Contact = {
  id: number;
  name: string;
  phone: string;
  email?: string | null;
  type: string;
};

function ContactRow({ contact }: { contact: Contact }) {
  const colors = useColors();
  const isCustomer = contact.type === 'customer';

  return (
    <TouchableOpacity
      style={[
        styles.row,
        { backgroundColor: colors.card, borderBottomColor: colors.border },
      ]}
      onPress={() => router.push(`/contact/${contact.id}`)}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.avatar,
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

      <View style={styles.rowBody}>
        <View style={styles.nameRow}>
          <Text
            style={[styles.contactName, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {contact.name}
          </Text>
          <View
            style={[
              styles.typeBadge,
              { backgroundColor: isCustomer ? '#22c55e25' : '#fb8c0425' },
            ]}
          >
            <Text
              style={[
                styles.typeText,
                { color: isCustomer ? '#22c55e' : '#fb8c04' },
              ]}
            >
              {isCustomer ? 'Customer' : 'Lead'}
            </Text>
          </View>
        </View>
        <Text style={[styles.phone, { color: colors.mutedForeground }]}>
          {contact.phone}
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          onPress={() => Linking.openURL(`tel:${contact.phone}`)}
          style={[styles.actionBtn, { backgroundColor: colors.primary + '15' }]}
          activeOpacity={0.7}
        >
          <Feather name="phone" size={15} color={colors.primary} />
        </TouchableOpacity>
        {contact.email ? (
          <TouchableOpacity
            onPress={() => Linking.openURL(`mailto:${contact.email}`)}
            style={[styles.actionBtn, { backgroundColor: colors.muted }]}
            activeOpacity={0.7}
          >
            <Feather name="mail" size={15} color={colors.mutedForeground} />
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export default function ContactsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 34 : insets.bottom;

  const [search, setSearch] = useState('');

  const { data: contacts, isLoading, isError, refetch } = useListContacts();

  const filtered = (contacts ?? []).filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      (c.email && c.email.toLowerCase().includes(search.toLowerCase()))
  );

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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Contacts</Text>
        <View
          style={[
            styles.searchBar,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Feather name="search" size={15} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search name, phone or email…"
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} activeOpacity={0.7}>
              <Feather name="x" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 60 }} />
      ) : isError ? (
        <View style={styles.center}>
          <Feather name="alert-circle" size={32} color={colors.mutedForeground} />
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
            Couldn't load contacts
          </Text>
          <TouchableOpacity onPress={() => refetch()} activeOpacity={0.7}>
            <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => <ContactRow contact={item} />}
          contentContainerStyle={{ paddingBottom: bottomPadding + 90 }}
          scrollEnabled={!!filtered.length}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="users" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                No contacts found
              </Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {search
                  ? 'Try a different search term'
                  : 'Add contacts from the web app'}
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
    gap: 12,
  },
  headerTitle: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  errorText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  retryText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  empty: { padding: 60, alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  rowBody: { flex: 1, gap: 3 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contactName: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    flex: 1,
  },
  typeBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  typeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  phone: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
