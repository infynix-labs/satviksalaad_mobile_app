import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useIsFocused, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppState,
  RefreshControl,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '@/components/ui/text';
import Animated, {
  Easing,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useQuery } from "@tanstack/react-query";

import { HomeHeader } from '@/components/ui/home-header';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/skeleton';
import { CafeCard } from '@/components/screens/home/cafe-card';
import { QuickActions } from '@/components/screens/home/quick-actions';
import { RecentActivity } from '@/components/screens/home/recent-activity';
import { ThisWeek } from '@/components/screens/home/this-week';
import { SubscriptionHero } from '@/components/screens/home/subscription-hero';
import { VideoStrip } from '@/components/screens/home/video-strip';
import { DeliveryDayCard } from '@/components/screens/deliveries/delivery-day-card';
import { deliveryDetailParams, useSubscriptions } from '@/components/screens/subscriptions/subscription-info';
import { Brand, CardEdge, FontSize, Radius, Spacing } from '@/constants/theme';
import { column } from '@/constants/layout';
import { homeApi, notificationsApi, plansApi, subscriptionsApi } from '@/lib/api';
import { useTrialPopupTrigger } from '@/hooks/use-trial-popup-trigger';
import { TrialBowlSheet } from '@/components/screens/home/trial-bowl-sheet';
import { GoalsSheet } from '@/components/screens/goals/goals-sheet';
import { goalsPopupDue, markGoalsPopupShown } from '@/lib/daily-goals';
import { TodayMenu } from '@/components/screens/menu/today-menu';
import { optimizedImageUrls } from '@/lib/image-url';
import { CACHE_TTL, homeStaticPersister } from '@/lib/query-client';
import { istDate } from '@/lib/delivery-rules';
import { useSlots } from '@/lib/slots';
import { useQueryFocusRefetch } from '@/hooks/useQueryFocusRefetch';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/context/auth';
import type { Subscription } from '@/types/api';
import { readHomeCache, writeHomeCache, parseTimeRange } from '@/lib/home-cache';
import { predictHomeState } from '@/lib/predictive-engine';
import type { PredictedHomeState } from '@/lib/predictive-engine';
import {
  categoryInfo,
  groupByDay,
  namesCategories,
  nextDeliveryDate,
  renewPlanSlug,
  toDayItem,
} from '@/lib/subscription-view';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// ─── Main screen ──────────────────────────────────────────────────────────────

/** Lets Home settle before the goals sheet slides up. */
const GOALS_POPUP_DELAY_MS = 800;

export default function HomeScreen() {
  const { colors, fonts, isDark } = useTheme();
  const router = useRouter();
  const { session, profile, cachedName } = useAuth();
  const slots = useSlots();

  const userId = session?.user?.id ?? null;

  // Synchronous MMKV read before first render — shows real data with zero skeleton on second+ opens
  const [predictedState, setPredictedState] = useState<PredictedHomeState | null>(() => {
    if (!userId) return null;
    const cached = readHomeCache(userId);
    if (!cached) return null;
    return predictHomeState({ cache: cached, now: new Date() });
  });

  // If session wasn't available at mount (rare), try once when it resolves
  React.useEffect(() => {
    if (!userId || predictedState) return;
    const cached = readHomeCache(userId);
    if (!cached) return;
    setPredictedState(predictHomeState({ cache: cached, now: new Date() }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['home'],
    queryFn: homeApi.critical,
    staleTime: CACHE_TTL.home,
    enabled: !!session,
  });
  useQueryFocusRefetch(['home']);

  const { data: staticData } = useQuery({
    queryKey: ['home-static'],
    queryFn: homeApi.static,
    staleTime: CACHE_TTL.homeStatic,
    persister: homeStaticPersister.persisterFn,
  });

  // Cached for the next cold start; this render already has live data.
  React.useEffect(() => {
    if (!data?.data || !userId || !staticData?.data) return;
    const slotWindows = staticData.data.slots.map((s) => {
      const { startMinutes, endMinutes } = parseTimeRange(s.time_range);
      return { id: s.id, label: s.label, startMinutes, endMinutes };
    });
    writeHomeCache(userId, { userId, cachedAt: new Date().toISOString(), home: data.data, slots: slotWindows });

    // Warm expo-image disk cache with all meal images so the menu tab loads
    // instantly when the user first opens it.
    const mealImageUrls = optimizedImageUrls(staticData.data.meals.map((m) => m.image_url));
    if (mealImageUrls.length > 0) {
      Image.prefetch(mealImageUrls)
        .catch(() => { /* non-critical */ });
    }
  }, [data, staticData, userId]);

  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: notificationsApi.list,
    staleTime: CACHE_TTL.notifications,
    refetchOnMount: false,
    enabled: !!session,
  });
  const hasUnreadNotifications = (notifData?.unread_count ?? 0) > 0;

  const { data: plansData } = useQuery({
    queryKey: ['plans'],
    queryFn: plansApi.list,
    staleTime: 10 * 60 * 1000,
  });
  const trialPlan = (plansData?.data ?? [])
    .filter((p) => p.is_trial)
    .sort((a, b) => a.price_paise - b.price_paise)[0] ?? null;

  const { data: subscriptionsData } = useSubscriptions(!!session);

  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  async function handleManualRefresh() {
    setIsManualRefreshing(true);
    await refetch();
    setIsManualRefreshing(false);
  }

  // A fire-and-forget side effect on every focus — not a data read, so not in useQuery
  useFocusEffect(
    useCallback(() => {
      void subscriptionsApi.sync().catch(() => {});
    }, [])
  );

  const screenOpacity = useSharedValue(1);
  const animatedScreenStyle = useAnimatedStyle(() => ({ opacity: screenOpacity.value }));

  // Dip-and-recover animation fires only on first install (skeleton was showing)
  // On second+ opens predictedState already shows real data — no dip needed
  const hadSkeleton = React.useRef(!predictedState);
  const prevIsLoading = React.useRef(true);
  React.useEffect(() => {
    if (prevIsLoading.current && !isLoading && hadSkeleton.current) {
      screenOpacity.value = 0.75;
      screenOpacity.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.ease) });
    }
    prevIsLoading.current = isLoading;
  }, [isLoading, screenOpacity]);

  // Show skeleton only when no cache exists (first install). Second+ opens: cache → instant render.
  const showSkeleton = !predictedState && isLoading;

  // Before the API answers, the cached prediction stands in.
  const home = data?.data ?? predictedState?.home ?? null;
  const open = useMemo(() => home?.subscriptions ?? [], [home]);
  const categories = useMemo(() => home?.categories ?? {}, [home]);
  const logs = useMemo(() => home?.logs ?? [], [home]);
  const allSubscriptions = subscriptionsData?.data ?? [];
  const running = open.some((s) => s.status === 'active');
  // Newest first, so the first one that ended is the latest.
  const lastEnded = running ? null : allSubscriptions.find((s) => s.status !== 'active' && s.status !== 'upcoming') ?? null;
  const hadSubscription = open.length > 0 || allSubscriptions.length > 0;
  const trialOffered =
    !!subscriptionsData &&
    !!trialPlan &&
    !subscriptionsData.meta.trial_used_by_category?.[trialPlan.category] &&
    allSubscriptions.length === 0;
  const showCategory = namesCategories(open);

  const today = istDate();
  const tomorrow = addDays(today, 1);
  const nowMs = Date.now();

  // Not memoised: which day is next moves with the clock.
  const displayDate = nextDeliveryDate(logs, today, nowMs);
  const dayItems = displayDate
    ? groupByDay(
        logs.filter((l) => l.delivery_date === displayDate && l.status !== 'cancelled').map((l) => toDayItem(l, categories)),
        (slug) => categoryInfo(categories, slug).sort_order,
      )[0]?.items ?? []
    : [];
  const sectionTitle =
    displayDate === today ? "Today's delivery" : displayDate === tomorrow ? "Tomorrow's delivery" : 'Next delivery';

  const recentLogs = [
    ...logs.filter(
      (l) =>
        l.delivery_date === today &&
        l.status === 'delivered' &&
        l.delivered_at != null &&
        nowMs - new Date(l.delivered_at).getTime() >= TWO_HOURS_MS,
    ),
    ...logs
      .filter((l) => l.delivery_date < today && l.status !== 'cancelled')
      .sort((a, b) => b.delivery_date.localeCompare(a.delivery_date)),
  ].slice(0, 3);

  function renew(sub: Subscription | null) {
    const slug = sub ? renewPlanSlug(sub) : null;
    router.push(slug ? { pathname: '/plans', params: { planId: slug } } : '/plans');
  }

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    'worklet';
    scrollY.value = event.contentOffset.y;
  });

  const [goalsOpen, setGoalsOpen] = useState(false);
  const isFocused = useIsFocused();
  const { show: showTrialSheet, dismiss: dismissTrialSheet } = useTrialPopupTrigger(scrollY, trialOffered && !!trialPlan && !goalsOpen);

  // Once a day, on the first open or when the app comes back on a new day; never over the trial sheet.
  // Home stays mounted beneath sign-in and pushed screens, so it also waits until Home is in front.
  useEffect(() => {
    if (!session || !isFocused) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      if (showTrialSheet || !goalsPopupDue()) return;
      timer = setTimeout(() => setGoalsOpen(true), GOALS_POPUP_DELAY_MS);
    };
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [showTrialSheet, session, isFocused]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      <HomeHeader
        scrollY={scrollY}
        onBellPress={() => router.push("/notifications")}
        hasBellDot={hasUnreadNotifications}
      />

      <Animated.ScrollView
        style={[styles.scroll, animatedScreenStyle]}
        contentContainerStyle={[
          column(),
          styles.content,
          { paddingTop: Spacing[3], paddingBottom: Spacing[5] },
        ]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        refreshControl={
          <RefreshControl
            refreshing={isManualRefreshing}
            onRefresh={() => void handleManualRefresh()}
            tintColor={colors.primary}
          />
        }
      >
        <SubscriptionHero
          open={open}
          lastEnded={lastEnded}
          categories={categories}
          today={today}
          loading={showSkeleton}
          onOpen={() => router.push("/subscriptions")}
          onRenew={renew}
        />

        {showSkeleton || displayDate || open.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader
              label={displayDate ? sectionTitle : 'Next delivery'}
              action="All deliveries"
              onAction={() => router.navigate('/(tabs)/deliveries')}
            />
            {showSkeleton ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.surface }, CardEdge]}>
                <Skeleton width={120} height={18} radius={5} />
                <View style={styles.skeletonRow}>
                  <Skeleton width={48} height={48} radius={Radius.md} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <Skeleton width="60%" height={15} radius={4} />
                    <Skeleton width="40%" height={13} radius={4} />
                  </View>
                </View>
                <Skeleton width="100%" height={48} radius={Radius.full} />
              </View>
            ) : displayDate ? (
              <DeliveryDayCard
                date={displayDate}
                items={dayItems}
                slots={slots}
                today={today}
                tomorrow={tomorrow}
                showCategory={showCategory}
                onOpenItem={(item) => router.push({ pathname: '/delivery-detail', params: deliveryDetailParams(item) })}
              />
            ) : (
              <View style={[styles.emptyCard, { backgroundColor: colors.surface }, CardEdge]}>
                <View style={[styles.emptyIcon, { backgroundColor: colors.primaryBg }]}>
                  <Ionicons name="calendar-outline" size={24} color={colors.primary} />
                </View>
                <Text style={[styles.emptyTitle, { color: colors.text, fontFamily: fonts.bodySemibold }]}>
                  No delivery coming up
                </Text>
                <Text style={[styles.emptyText, { color: colors.textMuted, fontFamily: fonts.body }]}>
                  Your days and deliveries are in Deliveries.
                </Text>
                <TouchableOpacity
                  style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
                  onPress={() => router.navigate('/(tabs)/deliveries')}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.emptyBtnText, { color: colors.textOnPrimary, fontFamily: fonts.bodySemibold }]}>
                    Open Deliveries
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : null}

        {(showSkeleton || open.length > 0) && (
          <View style={styles.section}>
            <SectionHeader
              label="This week"
              action="See all"
              onAction={() => router.navigate("/(tabs)/deliveries")}
            />
            <ThisWeek
              preferredDays={home?.schedule?.preferred_days ?? []}
              logs={logs}
              colors={colors}
              fonts={fonts}
              loading={showSkeleton}
              onDayPress={() => !isLoading && router.navigate("/(tabs)/deliveries")}
            />
          </View>
        )}

        <View style={styles.actions}>
          <View style={styles.section}>
            <SectionHeader label="Quick actions" />
            <QuickActions
              colors={colors}
              fonts={fonts}
              onSkipToday={() => router.navigate("/(tabs)/deliveries")}
              hadSubscription={hadSubscription}
              onPlans={() => router.push("/plans")}
              onMenu={() => router.push("/(tabs)/menu")}
              onSettings={() => router.push("/settings")}
            />
          </View>

          <TodayMenu onSeeMenu={() => router.navigate({ pathname: "/(tabs)/menu", params: { view: "daily" } })} />

          {(showSkeleton || recentLogs.length > 0) && (
            <RecentActivity
              logs={recentLogs}
              categories={categories}
              colors={colors}
              fonts={fonts}
              loading={showSkeleton}
              onSeeAll={() => router.push("/delivery-history")}
            />
          )}
        </View>

        <TouchableOpacity
          onPress={() => router.push("/diet-consultation")}
          activeOpacity={0.85}
          accessibilityRole="button"
          style={[styles.dietCard, { backgroundColor: Brand.forest }]}
        >
          <View style={styles.dietText}>
            <Text style={[styles.dietEyebrow, { color: colors.accent, fontFamily: fonts.bodySemibold }]}>
              1:1 DIET CONSULTATION
            </Text>
            <Text style={[styles.dietTitle, { color: colors.textOnPrimary, fontFamily: fonts.display }]}>
              Plan your diet with Divya Agrawal
            </Text>
            <Text style={[styles.dietSub, { color: colors.textOnPrimary, fontFamily: fonts.body }]}>
              Our founder and clinical dietitian · from ₹1,000
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textOnPrimary} />
        </TouchableOpacity>

        <CafeCard />

        <VideoStrip
          onOpen={(video) => router.push({ pathname: "/video-player", params: { id: video.id } })}
          onSeeAll={() => router.push("/videos")}
        />
      </Animated.ScrollView>

      <GoalsSheet
        visible={goalsOpen}
        firstName={(profile?.full_name ?? cachedName)?.trim().split(' ')[0] ?? null}
        onDismiss={() => {
          // Counted once closed: Home can remount while it is open, and it should show again then.
          markGoalsPopupShown();
          setGoalsOpen(false);
        }}
      />

      {trialOffered && trialPlan && (
        <TrialBowlSheet
          visible={showTrialSheet}
          plan={trialPlan}
          meals={(staticData?.data.meals ?? []).slice(0, 6).map((m) => ({
            id: m.name,
            name: m.name,
            image_url: m.image_url,
          }))}
          onDismiss={dismissTrialSheet}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: Spacing[5],
    gap: Spacing[5],
  },
  actions: {
    gap: Spacing[2.5],
  },
  section: {
    gap: Spacing[2],
  },
  dietCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    borderRadius: Radius.xl,
    padding: Spacing[4],
  },
  dietText: { flex: 1, gap: 2 },
  dietEyebrow: { fontSize: 11, letterSpacing: 1.1 },
  dietTitle: { fontSize: FontSize.lg },
  dietSub: { fontSize: FontSize.xs, opacity: 0.8 },
  emptyCard: {
    borderRadius: 16,
    padding: Spacing[4],
    gap: Spacing[2],
    alignItems: 'center',
  },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], alignSelf: 'stretch' },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: FontSize.md, textAlign: 'center' },
  emptyText: { fontSize: FontSize.base, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    minHeight: 44,
    paddingHorizontal: Spacing[6],
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing[1],
  },
  emptyBtnText: { fontSize: FontSize.base },
});
