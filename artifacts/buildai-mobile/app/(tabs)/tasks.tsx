import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Platform,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  AppState,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import {
  useListTasks,
  useCreateTask,
  useUpdateTask,
  useGenerateTasks,
  getListTasksQueryKey,
} from '@workspace/api-client-react';
import type { Task } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { OfflineBanner } from '@/components/OfflineBanner';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

type Tab = 'pending' | 'completed' | 'dismissed';
const TABS: { key: Tab; label: string }[] = [
  { key: 'pending', label: 'To do' },
  { key: 'completed', label: 'Done' },
  { key: 'dismissed', label: 'Dismissed' },
];
const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

function errMsg(e: unknown): string {
  const m = (e as { message?: string } | null)?.message;
  return m ? String(m) : 'Something went wrong. Please try again.';
}

export default function TasksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 34 : insets.bottom;
  const isOnline = useNetworkStatus();
  const qc = useQueryClient();

  const { data: tasks, isLoading, isError, refetch, isRefetching } = useListTasks();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const generate = useGenerateTasks();

  const [tab, setTab] = useState<Tab>('pending');
  const [title, setTitle] = useState('');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const submitting = useRef(false);
  const updating = useRef(false);
  const generating = useRef(false);
  const focused = useRef(false);

  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      refetchRef.current();
      const poll = setInterval(() => {
        if (AppState.currentState === 'active') refetchRef.current();
      }, 30000);
      return () => {
        focused.current = false;
        clearInterval(poll);
      };
    }, []),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && focused.current) refetchRef.current();
    });
    return () => sub.remove();
  }, []);

  const patchCache = async (changed: Task[]) => {
    // A fetch started before the mutation must not overwrite its saved response.
    await qc.cancelQueries({ queryKey: getListTasksQueryKey() });
    qc.setQueryData<Task[]>(getListTasksQueryKey(), (old) => {
      const list = old ? [...old] : [];
      for (const t of changed) {
        const i = list.findIndex((x) => x.id === t.id);
        if (i >= 0) list[i] = t;
        else list.unshift(t);
      }
      return list;
    });
    void qc.invalidateQueries({ queryKey: getListTasksQueryKey() });
  };

  const onAdd = async () => {
    const t = title.trim();
    if (!t || submitting.current || !isOnline) return;
    submitting.current = true;
    setNotice(null);
    try {
      const created = await createTask.mutateAsync({
        data: { title: t, priority: 'medium', source: 'manual' },
      });
      await patchCache([created]);
      setTitle('');
      setTab('pending');
    } catch (e) {
      setNotice({ kind: 'err', text: `Could not save task. ${errMsg(e)}` });
    } finally {
      submitting.current = false;
    }
  };

  const onStatus = async (task: Task, status: Tab) => {
    if (updating.current || !isOnline) return;
    updating.current = true;
    setBusyId(task.id);
    setNotice(null);
    try {
      const updated = await updateTask.mutateAsync({ id: task.id, data: { status } });
      await patchCache([updated]);
    } catch (e) {
      setNotice({ kind: 'err', text: `Could not update task. ${errMsg(e)}` });
    } finally {
      updating.current = false;
      setBusyId(null);
    }
  };

  const onGenerate = async () => {
    if (generating.current || !isOnline) return;
    generating.current = true;
    setNotice(null);
    try {
      const created = await generate.mutateAsync();
      await patchCache(created);
      setNotice({
        kind: 'ok',
        text:
          created.length === 0
            ? 'No new tasks found from recent activity.'
            : `Added ${created.length} AI-generated ${created.length === 1 ? 'task' : 'tasks'}.`,
      });
      setTab('pending');
    } catch (e) {
      setNotice({ kind: 'err', text: `Generation failed. ${errMsg(e)}` });
    } finally {
      generating.current = false;
    }
  };

  const all = tasks ?? [];
  const counts: Record<Tab, number> = {
    pending: all.filter((t) => t.status === 'pending').length,
    completed: all.filter((t) => t.status === 'completed').length,
    dismissed: all.filter((t) => t.status === 'dismissed').length,
  };
  const visible = all
    .filter((t) => t.status === tab)
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.id - a.id);

  const showError = isError && !tasks;
  const writeDisabled = !isOnline;

  const IconBtn = ({
    icon,
    label,
    onPress,
    disabled,
  }: {
    icon: React.ComponentProps<typeof Feather>['name'];
    label: string;
    onPress: () => void;
    disabled?: boolean;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      activeOpacity={0.7}
      style={[styles.iconBtn, { borderColor: colors.border, opacity: disabled ? 0.4 : 1 }]}
    >
      <Feather name={icon} size={18} color={colors.foreground} />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: topPadding + 20, borderBottomColor: colors.border },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Tasks</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {counts.pending} open
          </Text>
        </View>
        <TouchableOpacity
          onPress={onGenerate}
          disabled={writeDisabled || generate.isPending}
          accessibilityRole="button"
          accessibilityLabel="Generate tasks with AI"
          activeOpacity={0.8}
          style={[
            styles.genBtn,
            {
              backgroundColor: colors.primary,
              opacity: writeDisabled || generate.isPending ? 0.5 : 1,
            },
          ]}
        >
          {generate.isPending ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Feather name="zap" size={16} color={colors.primaryForeground} />
          )}
          <Text style={[styles.genText, { color: colors.primaryForeground }]}>
            {generate.isPending ? 'Generating' : 'AI Generate'}
          </Text>
        </TouchableOpacity>
      </View>

      {!isOnline && <OfflineBanner stale={!!tasks} />}

      <KeyboardAwareScrollViewCompat
        contentContainerStyle={{ padding: 16, paddingBottom: bottomPadding + 90 }}
        showsVerticalScrollIndicator={false}
        bottomOffset={20}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching && !isLoading}
            onRefresh={() => refetch()}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.addRow}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={writeDisabled ? 'Offline - adding disabled' : 'Add a task'}
            placeholderTextColor={colors.mutedForeground}
            editable={!writeDisabled && !createTask.isPending}
            returnKeyType="done"
            onSubmitEditing={onAdd}
            accessibilityLabel="New task title"
            style={[
              styles.input,
              { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border },
            ]}
          />
          <TouchableOpacity
            onPress={onAdd}
            disabled={writeDisabled || createTask.isPending || !title.trim()}
            accessibilityRole="button"
            accessibilityLabel="Add task"
            activeOpacity={0.8}
            style={[
              styles.addBtn,
              {
                backgroundColor: colors.primary,
                opacity: writeDisabled || createTask.isPending || !title.trim() ? 0.4 : 1,
              },
            ]}
          >
            {createTask.isPending ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Feather name="plus" size={22} color={colors.primaryForeground} />
            )}
          </TouchableOpacity>
        </View>

        {notice && (
          <View
            accessibilityLiveRegion="polite"
            style={[
              styles.notice,
              {
                borderColor: notice.kind === 'ok' ? colors.primary : colors.destructive,
                backgroundColor: colors.card,
              },
            ]}
          >
            <Feather
              name={notice.kind === 'ok' ? 'check-circle' : 'alert-circle'}
              size={16}
              color={notice.kind === 'ok' ? colors.primary : colors.destructive}
            />
            <Text style={[styles.noticeText, { color: colors.foreground }]}>{notice.text}</Text>
            <TouchableOpacity
              onPress={() => setNotice(null)}
              accessibilityRole="button"
              accessibilityLabel="Dismiss message"
              hitSlop={12}
            >
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.tabs}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                onPress={() => setTab(t.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={[
                  styles.tab,
                  {
                    backgroundColor: active ? colors.primary : colors.card,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: active ? colors.primaryForeground : colors.mutedForeground },
                  ]}
                >
                  {t.label} {counts[t.key]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {isLoading ? (
          <View style={{ gap: 10 }}>
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={[styles.skeleton, { backgroundColor: colors.card, borderColor: colors.border }]}
              />
            ))}
          </View>
        ) : showError ? (
          <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="alert-triangle" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              Could not load tasks
            </Text>
            <TouchableOpacity
              onPress={() => refetch()}
              accessibilityRole="button"
              accessibilityLabel="Retry loading tasks"
              style={[styles.retry, { borderColor: colors.primary }]}
            >
              <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : visible.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="check-square" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {tab === 'pending' ? 'Nothing on the list' : tab === 'completed' ? 'Nothing done yet' : 'Nothing dismissed'}
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {tab === 'pending'
                ? 'Add a task above or let AI pull follow-ups from recent calls, emails and jobs.'
                : 'Tasks you move here will show up in this list.'}
            </Text>
          </View>
        ) : (
          visible.map((task) => {
            const pc = task.priority === 'high' ? colors.destructive
              : task.priority === 'low' ? colors.primary : colors.info;
            const busy = busyId === task.id;
            const off = writeDisabled || busyId !== null;
            return (
              <View
                key={task.id}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={[styles.bar, { backgroundColor: pc }]} />
                <View style={styles.body}>
                  <Text
                    style={[
                      styles.taskTitle,
                      {
                        color: colors.foreground,
                        textDecorationLine: task.status === 'pending' ? 'none' : 'line-through',
                      },
                    ]}
                  >
                    {task.title}
                  </Text>
                  <View style={styles.metaRow}>
                    <View style={[styles.badge, { backgroundColor: pc + '25' }]}>
                      <Text style={[styles.badgeText, { color: pc }]}>
                        {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                      </Text>
                    </View>
                    {task.source === 'ai' && (
                      <View style={styles.metaItem}>
                        <Feather name="zap" size={12} color={colors.mutedForeground} />
                        <Text style={[styles.metaText, { color: colors.mutedForeground }]}>AI</Text>
                      </View>
                    )}
                    {task.dueDate ? (
                      <View style={styles.metaItem}>
                        <Feather name="clock" size={12} color={colors.mutedForeground} />
                        <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                          {new Date(task.dueDate).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                {busy ? (
                  <ActivityIndicator color={colors.primary} style={{ marginRight: 20 }} />
                ) : (
                  <View style={styles.actions}>
                    {task.status === 'pending' ? (
                      <>
                        <IconBtn
                          icon="check"
                          label={`Mark complete: ${task.title}`}
                          onPress={() => onStatus(task, 'completed')}
                          disabled={off}
                        />
                        <IconBtn
                          icon="x"
                          label={`Dismiss: ${task.title}`}
                          onPress={() => onStatus(task, 'dismissed')}
                          disabled={off}
                        />
                      </>
                    ) : (
                      <IconBtn
                        icon="rotate-ccw"
                        label={`Restore to pending: ${task.title}`}
                        onPress={() => onStatus(task, 'pending')}
                        disabled={off}
                      />
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  headerTitle: { fontSize: 26, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  headerSub: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 },
  genBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 5,
  },
  genText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  input: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 5,
    padding: 12,
    marginBottom: 12,
  },
  noticeText: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium' },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  tab: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 5,
  },
  tabText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  skeleton: { height: 70, borderRadius: 5, borderWidth: 1, opacity: 0.6 },
  empty: {
    padding: 36,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  retry: {
    minHeight: 44,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 5,
    borderWidth: 1,
    marginBottom: 10,
    overflow: 'hidden',
  },
  bar: { width: 4, alignSelf: 'stretch' },
  body: { flex: 1, padding: 14, gap: 8 },
  taskTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  badgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  actions: { flexDirection: 'row', gap: 8, paddingRight: 12 },
  iconBtn: {
    width: 44,
    height: 44,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
