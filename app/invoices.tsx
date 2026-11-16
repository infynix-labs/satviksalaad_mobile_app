import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/text';
import { EmptyState } from '@/components/ui/empty-state';
import Animated, { FadeIn, FadeInUp, FadeOut } from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';

import { ScreenHeader } from '@/components/ui/screen-header';

import { InvoicesSkeleton } from '@/components/skeletons/invoices-skeleton';
import { CardEdge, Radius, Spacing } from '@/constants/theme';
import { column } from '@/constants/layout';
import { useQueryFocusRefetch } from '@/hooks/useQueryFocusRefetch';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/context/auth';
import { invoicesApi } from '@/lib/api';
import { readInvoicesCache, writeInvoicesCache } from '@/lib/home-cache';
import { CACHE_TTL } from '@/lib/query-client';
import type { Invoice } from '@/types/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatRupeesFull(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Indian financial year (Apr–Mar) the date falls into, e.g. "2025-26". */
function fyOf(iso: string): string {
  const d = new Date(iso);
  // Approximate IST by adding 5h30m — fine for FY bucketing
  const ist = new Date(d.getTime() + 5.5 * 3600 * 1000);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth() + 1;
  const start = m >= 4 ? y : y - 1;
  return `${start}–${String(start + 1).slice(-2)}`;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function InvoicesScreen() {
  const { colors, fonts } = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  // Synchronous MMKV read before first render (fast path: session already resolved)
  const [cachedInvoices, setCachedInvoices] = useState<Invoice[] | null>(
    () => (userId ? readInvoicesCache(userId) : null),
  );
  // Deeplink path: userId is null on mount; read cache once when auth resolves.
  const cacheInitRef = useRef(userId !== null);
  useEffect(() => {
    if (cacheInitRef.current || !userId) return;
    cacheInitRef.current = true;
    const cached = readInvoicesCache(userId);
    if (cached) setCachedInvoices(cached);
  }, [userId]);
  const hadNoCache = React.useRef(cachedInvoices === null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['invoices'],
    queryFn: invoicesApi.list,
    staleTime: CACHE_TTL.invoices,
  });
  useQueryFocusRefetch(['invoices']);

  // Write MMKV cache when API responds
  React.useEffect(() => {
    if (!data?.data || !userId) return;
    writeInvoicesCache(userId, data.data);
  }, [data, userId]);

  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  async function handleManualRefresh() {
    setIsManualRefreshing(true);
    await refetch();
    setIsManualRefreshing(false);
  }

  // Skeleton only on first install; cached data shows immediately on second+ opens
  const showSkeleton = cachedInvoices === null && isLoading;
  const invoices: Invoice[] = data?.data ?? cachedInvoices ?? [];
  const errMsg = isError ? (error instanceof Error ? error.message : 'Unable to load invoices') : null;

  // Current FY only for the summary card
  const currentFy = fyOf(new Date().toISOString());
  const currentFyInvoices = invoices.filter((inv) => fyOf(inv.issued_at) === currentFy && inv.status !== 'superseded');
  const fySpendPaise = currentFyInvoices.reduce((sum, inv) => sum + inv.total_paise, 0);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Invoices" onBack={() => router.back()} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isManualRefreshing}
            onRefresh={() => void handleManualRefresh()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        contentContainerStyle={[
          column(),
          styles.scrollContent,
          { paddingTop: Spacing[4], paddingBottom: Spacing[5] },
        ]}
      >
        {/* FY summary card */}
        <View
          style={[
            styles.fyCard,
            { backgroundColor: colors.primaryTint },
          ]}
        >
          <Text style={[styles.fyLabel, { color: colors.primaryDark, fontFamily: fonts.bodySemibold }]}>
            FY {currentFy} SPEND
          </Text>
          <Text style={[styles.fyAmount, { color: colors.primaryDark, fontFamily: fonts.display }]}>
            {showSkeleton ? '—' : formatRupees(fySpendPaise)}
          </Text>
          <Text style={[styles.fyNote, { color: colors.textMuted, fontFamily: fonts.body }]}>
            {showSkeleton
              ? 'Loading…'
              : `${currentFyInvoices.length} invoice${currentFyInvoices.length !== 1 ? 's' : ''} this year`}
          </Text>
        </View>

        {/* Section heading */}
        <Text style={[styles.sectionHead, { color: colors.primary, fontFamily: fonts.bodySemibold }]}>
          RECENT
        </Text>

        {/* Skeleton — only on first install */}
        {showSkeleton && (
          <Animated.View exiting={FadeOut.duration(180)}>
            <InvoicesSkeleton />
          </Animated.View>
        )}

        {/* Error — only shown when there's no cached data to fall back to */}
        {!showSkeleton && isError && cachedInvoices === null && (
          <View style={styles.errorWrap}>
            <Ionicons name="alert-circle-outline" size={32} color={colors.textMuted} />
            <Text style={[styles.errorText, { color: colors.textMuted, fontFamily: fonts.body }]}>{errMsg}</Text>
            <Pressable
              onPress={() => void refetch()}
              style={({ pressed }) => [
                styles.retryBtn,
                { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={[styles.retryBtnText, { fontFamily: fonts.bodySemibold }]}>Retry</Text>
            </Pressable>
          </View>
        )}

        {/* List */}
        {!showSkeleton && (!isError || cachedInvoices !== null) && (
          <Animated.View
            entering={hadNoCache.current
              ? FadeInUp.duration(300).withInitialValues({ transform: [{ translateY: 6 }] })
              : undefined}
          >
            {invoices.length === 0 ? (
              <EmptyState
                icon="receipt-outline"
                title="No invoices yet"
                body="Invoices for your orders appear here."
              />
            ) : (
              <View style={[styles.listCard, { backgroundColor: colors.surface, borderWidth: 0 }, CardEdge]}>
                {invoices.map((invoice, index) => (
                  <InvoiceRow
                    key={invoice.id}
                    invoice={invoice}
                    isLast={index === invoices.length - 1}
                    onPress={() =>
                      router.push({
                        pathname: '/invoice-detail',
                        params: { id: invoice.id, invoice_number: invoice.invoice_number },
                      })
                    }
                    colors={colors}
                    fonts={fonts}
                  />
                ))}
              </View>
            )}
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

type ThemeColors = ReturnType<typeof useTheme>['colors'];
type ThemeFonts = ReturnType<typeof useTheme>['fonts'];

function InvoiceRow({
  invoice,
  isLast,
  onPress,
  colors,
  fonts,
}: {
  invoice: Invoice;
  isLast: boolean;
  onPress: () => void;
  colors: ThemeColors;
  fonts: ThemeFonts;
}) {
  const isRevision = !!invoice.revision_of;
  const isSuperseded = invoice.status === 'superseded';
  const pdfReady = invoice.has_pdf !== false;
  const planLabel = invoice.plan_label ?? 'Invoice';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        pressed && { backgroundColor: colors.surface2 },
      ]}
    >
      {/* Icon */}
      <View
        style={[
          styles.rowIcon,
          { backgroundColor: isSuperseded ? colors.surface2 : colors.sageSoft },
        ]}
      >
        <Ionicons
          name="receipt-outline"
          size={18}
          color={isSuperseded ? colors.textMuted : colors.primaryDark}
        />
      </View>

      {/* Left text column */}
      <View style={styles.rowLeft}>
        <Text
          style={[styles.invoiceNumber, { color: colors.text, fontFamily: fonts.mono ?? fonts.bodySemibold }]}
          numberOfLines={1}
        >
          {invoice.invoice_number}
          {invoice.version && invoice.version > 1 ? `  ·  v${invoice.version}` : ''}
        </Text>
        <Text
          style={[styles.planLabel, { color: colors.text, fontFamily: fonts.body }]}
          numberOfLines={1}
        >
          {planLabel}
        </Text>
        <View style={styles.metaRow}>
          <Text style={[styles.dateText, { color: colors.textMuted, fontFamily: fonts.body }]}>
            {formatDateShort(invoice.issued_at)}
          </Text>
          {isRevision && (
            <Tag label="Revised" tone="violet" colors={colors} fonts={fonts} />
          )}
          {isSuperseded && (
            <Tag label="Superseded" tone="amber" colors={colors} fonts={fonts} />
          )}
          {!pdfReady && !isSuperseded && (
            <Tag label="Preparing" tone="error" colors={colors} fonts={fonts} />
          )}
          {invoice.discount_paise > 0 && (
            <Tag label={`−${formatRupees(invoice.discount_paise)}`} tone="primary" colors={colors} fonts={fonts} />
          )}
        </View>
      </View>

      {/* Right column: amount */}
      <View style={styles.rowRight}>
        <Text
          style={[styles.amount, { color: colors.text, fontFamily: fonts.display }]}
          numberOfLines={1}
        >
          {formatRupeesFull(invoice.total_paise)}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

function Tag({
  label,
  tone,
  colors,
  fonts,
}: {
  label: string;
  tone: 'primary' | 'amber' | 'violet' | 'error';
  colors: ThemeColors;
  fonts: ThemeFonts;
}) {
  const palette = {
    primary: { bg: colors.primaryBg, fg: colors.primaryDark },
    amber:   { bg: '#FEF6E4',        fg: '#A06A00' },
    violet:  { bg: '#EEF0FB',        fg: '#3F47B0' },
    error:   { bg: colors.errorBg,   fg: colors.error },
  }[tone];
  return (
    <View style={[tagStyles.tag, { backgroundColor: palette.bg }]}>
      <Text style={[tagStyles.text, { color: palette.fg, fontFamily: fonts.bodySemibold }]}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { flexGrow: 1 },

  // FY summary card
  fyCard: {
    marginHorizontal: Spacing[5],
    marginBottom: Spacing[4],
    borderRadius: Radius.lg,
    padding: Spacing[4],
  },
  fyLabel: { fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase' },
  fyAmount: { fontSize: 28, letterSpacing: -0.5, marginTop: 4 },
  fyNote: { fontSize: 12, marginTop: 4 },

  // Section heading
  sectionHead: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginHorizontal: Spacing[5],
    marginBottom: 8,
  },

  // Empty

  // Error
  errorWrap: { paddingHorizontal: Spacing[5], paddingVertical: Spacing[6], alignItems: 'center', gap: 8 },
  errorText: { fontSize: 13, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: Radius.md, marginTop: 4 },
  retryBtnText: { color: '#fff', fontSize: 13 },

  // List
  listCard: {
    marginHorizontal: Spacing[5],
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing[4],
    gap: Spacing[3],
  },
  rowIcon: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  rowLeft: { flex: 1, minWidth: 0 },
  invoiceNumber: { fontSize: 12, letterSpacing: 0.2 },
  planLabel: { fontSize: 14, marginTop: 3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  dateText: { fontSize: 11.5 },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  amount: { fontSize: 15, letterSpacing: -0.2 },
});

const tagStyles = StyleSheet.create({
  tag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  text: { fontSize: 10, letterSpacing: 0.2 },
});
