import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '@/components/ui/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Skeleton } from '@/components/skeleton';
import { ScreenHeader } from '@/components/ui/screen-header';
import { FontSize, Radius, Spacing } from '@/constants/theme';
import { column, SHEET_WIDTH } from '@/constants/layout';
import { useAuth } from '@/context/auth';
import { useQueryFocusRefetch } from '@/hooks/useQueryFocusRefetch';
import { useTheme } from '@/hooks/use-theme';
import { notificationsApi } from '@/lib/api';
import { CACHE_TTL } from '@/lib/query-client';
import { useWhatsAppOrdering } from '@/lib/whatsapp-ordering';

// ─── Types ────────────────────────────────────────────────────────────────────

type DbNotification = {
  id: string;
  title: string;
  body: string;
  type: 'order' | 'delivery' | 'payment' | 'promo' | 'system';
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};

// ─── Filter config ────────────────────────────────────────────────────────────

const FILTERS = ['All', 'Deliveries', 'Payments', 'Offers'] as const;
type Filter = (typeof FILTERS)[number];

function filterToType(f: Filter): DbNotification['type'] | null {
  if (f === 'Deliveries') return 'delivery';
  if (f === 'Payments') return 'payment';
  if (f === 'Offers') return 'promo';
  return null;
}

// ─── Type config ──────────────────────────────────────────────────────────────

type TypeConfig = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  bg: string;
  label: string;
};

function typeConfig(
  type: DbNotification['type'],
  colors: ReturnType<typeof useTheme>['colors'],
): TypeConfig {
  const c: Record<DbNotification['type'], TypeConfig> = {
    order:    { icon: 'bag-check-outline',          color: colors.primary,       bg: colors.primaryBg,  label: 'Order' },
    delivery: { icon: 'bicycle-outline',            color: colors.blue,          bg: colors.blueBg,     label: 'Delivery' },
    payment:  { icon: 'card-outline',               color: colors.purple,        bg: colors.purpleBg,   label: 'Payment' },
    promo:    { icon: 'gift-outline',               color: colors.orange,        bg: colors.orangeBg,   label: 'Offer' },
    system:   { icon: 'information-circle-outline', color: colors.textSecondary, bg: colors.surface2,   label: 'Info' },
  };
  return c[type] ?? c.system;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow({
  colors,
  index,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  index: number;
}) {
  return (
    <View
      style={[
        row.wrap,
        { backgroundColor: colors.surface },
        index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight },
      ]}
    >
      {/* Circle icon placeholder */}
      <Skeleton width={44} height={44} radius={22} />

      <View style={row.content}>
        <View style={row.topLine}>
          <Skeleton width={140} height={13} radius={4} />
          <Skeleton width={34} height={10} radius={4} />
        </View>
        <Skeleton width="72%" height={11} radius={4} style={{ marginTop: 5 }} />
      </View>
    </View>
  );
}

// ─── Notification row ─────────────────────────────────────────────────────────

const NotifRow = React.memo(function NotifRow({
  item,
  isFirst,
  colors,
  fonts,
  onPress,
}: {
  item: DbNotification;
  isFirst: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
  fonts: ReturnType<typeof useTheme>['fonts'];
  onPress: (n: DbNotification) => void;
}) {
  const cfg = typeConfig(item.type, colors);
  const unread = !item.is_read;

  return (
    <TouchableOpacity
        activeOpacity={0.75}
        onPress={() => onPress(item)}
        style={[
          row.wrap,
          { backgroundColor: unread ? colors.primaryBg : colors.surface },
          !isFirst && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight },
        ]}
      >
        {/* Circle icon */}
        <View style={[row.iconCircle, { backgroundColor: cfg.bg }]}>
          <Ionicons name={cfg.icon} size={20} color={cfg.color} />
        </View>

        {/* Content */}
        <View style={row.content}>
          {/* Title + time row */}
          <View style={row.topLine}>
            <Text
              style={[
                row.title,
                {
                  color: colors.text,
                  fontFamily: unread ? fonts.bodySemibold : fonts.body,
                  flex: 1,
                },
              ]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <View style={row.timeWrap}>
              {unread && (
                <View style={[row.unreadDot, { backgroundColor: cfg.color }]} />
              )}
              <Text style={[row.time, { color: colors.textMuted, fontFamily: fonts.body }]}>
                {timeAgo(item.created_at)}
              </Text>
            </View>
          </View>

          {/* Body */}
          <Text
            style={[row.body, { color: unread ? colors.textSecondary : colors.textMuted, fontFamily: fonts.body }]}
            numberOfLines={1}
          >
            {item.body}
          </Text>

          {/* Category label — hidden for system/info since the icon already conveys it */}
          {item.type !== 'system' && (
            <View style={[row.label, { backgroundColor: cfg.bg }]}>
              <Text style={[row.labelText, { color: cfg.color, fontFamily: fonts.bodyMedium }]}>
                {cfg.label}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
  );
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();

  const { user } = useAuth();
  const router = useRouter();

  const qc = useQueryClient();
  const [activeFilter, setActiveFilter] = useState<Filter>('All');
  const [selectedNotif, setSelectedNotif] = useState<DbNotification | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: notificationsApi.list,
    staleTime: CACHE_TTL.notifications,
    enabled: !!user,
  });
  useQueryFocusRefetch(['notifications']);

  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  async function handleManualRefresh() {
    setIsManualRefreshing(true);
    await refetch();
    setIsManualRefreshing(false);
  }

  const notifications = (data?.data ?? []) as DbNotification[];

  const handleMarkRead = useCallback(async (notif: DbNotification) => {
    if (notif.is_read) return;
    qc.setQueryData(['notifications'], (old: typeof data) => ({
      ...old,
      unread_count: Math.max(0, (old?.unread_count ?? 1) - 1),
      data: (old?.data ?? []).map((n) =>
        n.id === notif.id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n,
      ),
    }));
    // A failed write puts the server's read state back.
    await notificationsApi.markRead(notif.id).catch(() => qc.invalidateQueries({ queryKey: ['notifications'] }));
  }, [qc]);

  const handleMarkAllRead = useCallback(async () => {
    if (!user) return;
    qc.setQueryData(['notifications'], (old: typeof data) => ({
      ...old,
      unread_count: 0,
      data: (old?.data ?? []).map((n) => ({
        ...n, is_read: true, read_at: (n as DbNotification).read_at ?? new Date().toISOString(),
      })),
    }));
    await notificationsApi.markAllRead().catch(() => qc.invalidateQueries({ queryKey: ['notifications'] }));
  }, [user, qc]);

  const handlePress = useCallback(
    (notif: DbNotification) => {
      setSelectedNotif(notif);
      if (!notif.is_read) void handleMarkRead(notif);
    },
    [handleMarkRead],
  );

  const whatsappOrdering = useWhatsAppOrdering();
  const filters = whatsappOrdering ? FILTERS.filter((f) => f !== 'Payments') : FILTERS;
  const typeFilter = filterToType(activeFilter);
  const filtered = typeFilter
    ? notifications.filter((n) => n.type === typeFilter)
    : notifications;

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const selectedCfg = selectedNotif ? typeConfig(selectedNotif.type, colors) : null;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>

      <ScreenHeader
        title="Notifications"
        onBack={() => router.back()}
        subtitle={unreadCount > 0 && !isLoading ? `${unreadCount} unread` : undefined}
        right={
          unreadCount > 0 ? (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => void handleMarkAllRead()}
              style={[styles.markAllBtn, { backgroundColor: colors.primaryBg }]}
            >
              <Text style={[styles.markAllText, { color: colors.primary, fontFamily: fonts.bodySemibold }]}>
                Mark all read
              </Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      {/* ── Filter chips ──────────────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.filtersContent, { paddingHorizontal: Spacing[5] }]}
        style={[styles.filtersScroll, column()]}
      >
        {filters.map((f) => {
          const isActive = f === activeFilter;
          return (
            <TouchableOpacity
              key={f}
              activeOpacity={0.7}
              onPress={() => setActiveFilter(f)}
              style={[
                styles.chip,
                {
                  backgroundColor: isActive ? colors.primary : colors.surface2,
                  borderColor: 'transparent',
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  {
                    color: isActive ? '#fff' : colors.textMuted,
                    fontFamily: isActive ? fonts.bodySemibold : fonts.body,
                  },
                ]}
              >
                {f}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── List ──────────────────────────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[column(), { paddingBottom: Spacing[5] }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isManualRefreshing}
            onRefresh={() => void handleManualRefresh()}
            tintColor={colors.primary}
          />
        }
      >
        {isLoading ? (
          <View style={{ marginTop: Spacing[2] }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <SkeletonRow key={i} colors={colors} index={i} />
            ))}
          </View>
        ) : filtered.length === 0 ? (
          <View style={[styles.empty, { paddingHorizontal: Spacing[5] }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.surface2 }]}>
              <Ionicons name="notifications-off-outline" size={28} color={colors.textMuted} />
            </View>
            <Text
              style={[styles.emptyTitle, { color: colors.text, fontFamily: fonts.bodySemibold }]}
            >
              No notifications
            </Text>
            <Text
              style={[styles.emptyBody, { color: colors.textMuted, fontFamily: fonts.body }]}
            >
              {activeFilter === 'All'
                ? "You're all caught up!"
                : `No ${activeFilter.toLowerCase()} notifications yet`}
            </Text>
          </View>
        ) : (
          <View style={{ marginTop: Spacing[2] }}>
            {filtered.map((item, index) => (
              <NotifRow
                key={item.id}
                item={item}
                isFirst={index === 0}
                colors={colors}
                fonts={fonts}
                onPress={handlePress}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* ── Detail bottom sheet ───────────────────────────────────────────── */}
      <Modal
        visible={selectedNotif !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedNotif(null)}
        statusBarTranslucent
      >
        {/* Backdrop — full screen, tap to close */}
        <Pressable
          style={modal.backdrop}
          onPress={() => setSelectedNotif(null)}
        />

        {/* Sheet wrapper — box-none so backdrop receives taps outside the sheet */}
        <View style={modal.sheetWrapper} pointerEvents="box-none">
          <View
            style={[
              modal.sheet,
              column(SHEET_WIDTH),
              {
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                paddingBottom: insets.bottom + Spacing[4],
              },
            ]}
          >
            {/* Handle */}
            <View style={[modal.handle, { backgroundColor: colors.border }]} />

            {selectedNotif && selectedCfg && (
              <>
                {/* Icon + type */}
                <View style={modal.iconRow}>
                  <View style={[modal.iconCircle, { backgroundColor: selectedCfg.bg }]}>
                    <Ionicons name={selectedCfg.icon} size={24} color={selectedCfg.color} />
                  </View>
                  <View style={[modal.typePill, { backgroundColor: selectedCfg.bg }]}>
                    <Text
                      style={[
                        modal.typePillText,
                        { color: selectedCfg.color, fontFamily: fonts.bodyMedium },
                      ]}
                    >
                      {selectedCfg.label}
                    </Text>
                  </View>
                  <Text style={[modal.sheetTime, { color: colors.textMuted, fontFamily: fonts.body }]}>
                    {formatFullDate(selectedNotif.created_at)}
                  </Text>
                </View>

                {/* Title */}
                <Text
                  style={[
                    modal.title,
                    { color: colors.text, fontFamily: fonts.display },
                  ]}
                >
                  {selectedNotif.title}
                </Text>

                {/* Body */}
                <Text
                  style={[
                    modal.body,
                    { color: colors.textSecondary, fontFamily: fonts.body },
                  ]}
                >
                  {selectedNotif.body}
                </Text>
              </>
            )}

            <TouchableOpacity
              style={[modal.doneBtn, { backgroundColor: colors.primary }]}
              onPress={() => setSelectedNotif(null)}
              activeOpacity={0.85}
            >
              <Text style={[modal.doneBtnText, { fontFamily: fonts.bodySemibold }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Row styles ───────────────────────────────────────────────────────────────

const row = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing[5],
    paddingVertical: 13,
    gap: Spacing[3],
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  content: {
    flex: 1,
    gap: 4,
    paddingTop: 2,
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  title: {
    fontSize: FontSize.sm,
  },
  timeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  time: {
    fontSize: 11,
  },
  body: {
    fontSize: FontSize.xs,
    lineHeight: FontSize.xs * 1.5,
  },
  label: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
    marginTop: 2,
  },
  labelText: {
    fontSize: 10,
    letterSpacing: 0.3,
  },
});

// ─── Modal styles ─────────────────────────────────────────────────────────────

const modal = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  sheetWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[3],
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing[5],
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    marginBottom: Spacing[4],
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  typePillText: {
    fontSize: FontSize.xs,
  },
  sheetTime: {
    fontSize: 11,
    flex: 1,
    textAlign: 'right',
  },
  title: {
    fontSize: FontSize.xl,
    letterSpacing: -0.3,
    marginBottom: Spacing[3],
  },
  body: {
    fontSize: FontSize.base,
    lineHeight: FontSize.base * 1.6,
    marginBottom: Spacing[5],
  },
  doneBtn: {
    height: 50,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    fontSize: FontSize.base,
    color: '#fff',
  },
});

// ─── Screen styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  markAllBtn:  { paddingHorizontal: Spacing[3], paddingVertical: 7, borderRadius: Radius.full },
  markAllText: { fontSize: FontSize.xs },

  filtersScroll:  { flexGrow: 0 },
  filtersContent: { flexDirection: 'row', gap: Spacing[2], paddingVertical: Spacing[3] },
  chip: {
    paddingHorizontal: Spacing[4],
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  chipText: { fontSize: FontSize.sm },

  scroll: { flex: 1 },

  empty: {
    alignItems: 'center',
    paddingTop: 72,
    gap: Spacing[2],
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[3],
  },
  emptyTitle: { fontSize: FontSize.base },
  emptyBody:  { fontSize: FontSize.sm, textAlign: 'center' },
});
