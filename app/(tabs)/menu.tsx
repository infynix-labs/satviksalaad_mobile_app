import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Text } from '@/components/ui/text';
import { EmptyState } from '@/components/ui/empty-state';
import Animated, { FadeIn, FadeInUp, FadeOut } from 'react-native-reanimated';
import { useTopInset } from '@/hooks/use-top-inset';
import { useQuery } from '@tanstack/react-query';

import { MenuSkeleton } from '@/components/skeletons/menu-skeleton';
import { DeliveryMenu, useMonthlyMenu, type MenuBowl } from '@/components/screens/menu/delivery-menu';
import { MealCard } from '@/components/screens/menu/meal-card';
import { CardEdge, FontSize, FontWeight, Radius, Shadows, Spacing } from '@/constants/theme';
import { column, columnsFor, READING_WIDTH, WIDE_WIDTH } from '@/constants/layout';
import { useQueryFocusRefetch } from '@/hooks/useQueryFocusRefetch';
import { useTheme } from '@/hooks/use-theme';
import { menuApi } from '@/lib/api';
import { readMenuCache, writeMenuCache } from '@/lib/home-cache';
import { optimizedImageUrls } from '@/lib/image-url';
import { asyncPersister, CACHE_TTL } from '@/lib/query-client';
import type { MenuCategory, MenuMeal, NutritionFlags } from '@/types/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Meal {
  id: string;
  name: string;
  category: string;
  categoryName: string;
  dietLabels: string[];
  kcal: number | null;
  protein: number | null;
  fiber: number | null;
  carbs: number | null;
  fat: number | null;
  imageUrl: string | null;
  description: string | null;
  ingredients: string[];
}

const GRID_GAP = 12;

type MenuView = 'daily' | 'bowls';

const VIEWS: { key: MenuView; label: string }[] = [
  { key: 'daily', label: 'Daily menu' },
  { key: 'bowls', label: 'All bowls' },
];

/** Names for servers that don't send categories yet. */
const FALLBACK_NAMES: Record<string, string> = { salad: 'Salads', fruit: 'Fruit bowls' };

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function MenuScreen() {
  const { colors, fonts } = useTheme();
  const topInset = useTopInset();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const gridWidth = Math.min(width, WIDE_WIDTH) - Spacing[5] * 2;
  const columns = columnsFor(gridWidth, 320, GRID_GAP);
  const cardWidth = Math.floor((gridWidth - GRID_GAP * (columns - 1)) / columns);

  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [chosenView, setChosenView] = useState<MenuView | null>(null);
  const params = useLocalSearchParams<{ view?: string }>();
  const deliveryMenu = useMonthlyMenu();

  // Synchronous MMKV read before first render — shows menu instantly on second+ opens
  const [cachedMenu, setCachedMenu] = useState(() => readMenuCache());
  // Only play skeleton/FadeIn animations on first install (no cache)
  const hadNoCache = React.useRef(cachedMenu === null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['menu'],
    queryFn: menuApi.get,
    staleTime: CACHE_TTL.menu,
    persister: asyncPersister.persisterFn,
  });
  useQueryFocusRefetch(['menu']);

  // Write MMKV cache when API responds
  React.useEffect(() => {
    if (!data?.data) return;
    const next = {
      meals: data.data.meals,
      categories: data.data.categories,
      showFruits: data.data.showFruits,
      nutritionFlags: data.data.nutritionFlags,
    };
    writeMenuCache(next);
    setCachedMenu(next);
  }, [data]);

  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  async function handleManualRefresh() {
    setIsManualRefreshing(true);
    await Promise.all([refetch(), deliveryMenu.refetch()]);
    setIsManualRefreshing(false);
  }

  // Server data takes priority; MMKV cache fills in before first API response
  const rawMeals = useMemo(
    () => data?.data?.meals ?? cachedMenu?.meals ?? [],
    [data?.data?.meals, cachedMenu?.meals],
  );
  const showFruits: boolean   = data?.data?.showFruits    ?? cachedMenu?.showFruits    ?? false;
  const nutritionFlags = useMemo<NutritionFlags>(
    () =>
      data?.data?.nutritionFlags ??
      cachedMenu?.nutritionFlags ?? { calories: true, protein: true, fiber: false, carbs: true, fat: true },
    [data?.data?.nutritionFlags, cachedMenu?.nutritionFlags],
  );


  const categories = useMemo<MenuCategory[]>(() => {
    const listed = data?.data?.categories ?? cachedMenu?.categories;
    const all = listed?.length
      ? listed
      : [...new Set(rawMeals.map((m) => m.category))].map((slug) => ({
          slug,
          name: FALLBACK_NAMES[slug] ?? slug,
          unit_singular: 'bowl',
          unit_plural: 'bowls',
        }));
    return all.filter((c) => (c.slug === 'fruit' ? showFruits : rawMeals.some((m) => m.category === c.slug)));
  }, [data?.data?.categories, cachedMenu?.categories, rawMeals, showFruits]);

  const meals = useMemo<Meal[]>(() =>
    rawMeals.map((m: MenuMeal) => ({
      id: m.id,
      name: m.name,
      category: m.category,
      categoryName: categories.find((c) => c.slug === m.category)?.name ?? FALLBACK_NAMES[m.category] ?? m.category,
      dietLabels: m.diet_labels ?? [],
      kcal: m.calories,
      protein: m.protein_g,
      fiber: m.fiber_g,
      carbs: m.carbs_g,
      fat: m.fat_g,
      imageUrl: m.image_url,
      description: m.description ?? null,
      ingredients: m.ingredients ?? [],
    })),
  [rawMeals, categories]);

  // Prefetch all meal images into expo-image's disk cache as soon as URLs are
  // available — fires immediately from MMKV on second+ opens, or after the
  // first API response on install. This ensures images are ready before the
  // user scrolls.
  React.useEffect(() => {
    const urls = optimizedImageUrls(rawMeals.map((m: MenuMeal) => m.image_url));
    if (urls.length > 0) {
      Image.prefetch(urls)
        .catch(() => { /* non-critical */ });
    }
  }, [rawMeals]);

  const effectiveTab = categories.some((c) => c.slug === activeTab) ? activeTab : categories[0]?.slug ?? null;
  const visible = meals.filter((m) => m.category === effectiveTab);

  // Home's "Full menu" asks for the daily menu with a param, which is cleared on the next switch so a later ask works again.
  const askedDaily = params.view === 'daily';
  const hasDaily = deliveryMenu.months.length > 0;
  const view: MenuView = hasDaily ? (askedDaily ? 'daily' : (chosenView ?? 'daily')) : 'bowls';
  // Skeleton only on first install (no cache). Second+ opens: instant content.
  const showSkeleton =
    view === 'bowls' && ((cachedMenu === null && isLoading) || (chosenView === null && deliveryMenu.isLoading));

  function pickView(next: MenuView) {
    if (next === view) return;
    void Haptics.selectionAsync().catch(() => {});
    if (askedDaily) router.setParams({ view: undefined });
    setChosenView(next);
  }

  const openMeal = useCallback(
    (meal: Meal) =>
      router.push({
        pathname: '/meal-detail',
        params: {
          id: meal.id,
          name: meal.name,
          imageUrl: meal.imageUrl ?? '',
          kcal: String(meal.kcal ?? 0),
          protein: String(meal.protein ?? 0),
          fiber: String(meal.fiber ?? 0),
          carbs: String(meal.carbs ?? 0),
          fat: String(meal.fat ?? 0),
          category: meal.category,
          categoryName: meal.categoryName,
          dietLabels: meal.dietLabels.join(','),
          description: meal.description ?? '',
          ingredients: meal.ingredients.join(','),
          showCalories: String(nutritionFlags.calories),
          showProtein: String(nutritionFlags.protein),
          showFiber: String(nutritionFlags.fiber),
          showCarbs: String(nutritionFlags.carbs),
          showFat: String(nutritionFlags.fat),
        },
      }),
    [router, nutritionFlags],
  );

  const bowlFor = useCallback(
    (name: string): MenuBowl | undefined => {
      const key = name.trim().toLowerCase();
      const meal = meals.find((m) => m.name.trim().toLowerCase() === key);
      if (!meal) return undefined;
      const facts = [
        nutritionFlags.calories && (meal.kcal ?? 0) > 0 ? `${meal.kcal} kcal` : null,
        nutritionFlags.protein && (meal.protein ?? 0) > 0 ? `${meal.protein} g protein` : null,
      ].filter(Boolean);
      return { imageUrl: meal.imageUrl, facts: facts.length > 0 ? facts.join(' · ') : null, open: () => openMeal(meal) };
    },
    [meals, nutritionFlags, openMeal],
  );

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          s.header,
          column(view === 'daily' ? READING_WIDTH : WIDE_WIDTH),
          {
            paddingTop: topInset + (Platform.OS === 'android' ? 12 : 0),
            backgroundColor: colors.background,
          },
        ]}
      >
        <Text style={[s.eyebrow, { color: colors.primary, fontFamily: fonts.bodySemibold }]}>100% Pure Veg · Fresh Daily</Text>
        <Text style={[s.title, { color: colors.text, fontFamily: fonts.display }]}>Our Menu</Text>
        {hasDaily ? (
          <View style={[s.segments, { backgroundColor: colors.surface2 }]} accessibilityRole="tablist">
            {VIEWS.map(({ key, label }) => {
              const active = view === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => pickView(key)}
                  activeOpacity={0.8}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  style={[s.segment, active && { backgroundColor: colors.surface }, active && CardEdge]}
                >
                  <Text
                    style={[
                      s.segmentText,
                      { color: active ? colors.text : colors.textMuted, fontFamily: active ? fonts.bodySemibold : fonts.bodyMedium },
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
        {view === 'bowls' && categories.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
            {categories.map((category) => {
              const active = effectiveTab === category.slug;
              return (
                <TouchableOpacity
                  key={category.slug}
                  onPress={() => setActiveTab(category.slug)}
                  activeOpacity={0.8}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  style={[
                    s.chip,
                    active ? { backgroundColor: colors.primary, ...Shadows.sm } : { backgroundColor: colors.surface2 },
                  ]}
                >
                  <Text
                    style={[
                      s.toggleText,
                      { color: active ? '#fff' : colors.textMuted, fontFamily: active ? fonts.bodySemibold : fonts.body },
                    ]}
                  >
                    {category.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      {view === 'daily' ? (
        <DeliveryMenu
          months={deliveryMenu.months}
          bowlFor={bowlFor}
          refreshing={isManualRefreshing}
          onRefresh={() => void handleManualRefresh()}
        />
      ) : showSkeleton ? (
        <Animated.View exiting={FadeOut.duration(200)} style={{ flex: 1 }}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <MenuSkeleton />
          </ScrollView>
        </Animated.View>
      ) : (
        <Animated.View
          entering={hadNoCache.current ? FadeInUp.duration(350).withInitialValues({ transform: [{ translateY: 8 }] }) : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[column(WIDE_WIDTH), s.scroll, { paddingBottom: Spacing[5] }]}
            refreshControl={
              <RefreshControl
                refreshing={isManualRefreshing}
                onRefresh={() => void handleManualRefresh()}
                tintColor={colors.primary}
              />
            }
          >
            {visible.length === 0 ? (
              isError && rawMeals.length === 0 ? (
                <EmptyState
                  icon="cloud-offline-outline"
                  title="The menu didn't load"
                  body="Check your connection and try again."
                  actionLabel="Try again"
                  onAction={() => void refetch()}
                />
              ) : (
                <EmptyState icon="leaf-outline" title="No meals yet" body="Check back soon!" />
              )
            ) : (
              <View style={s.grid}>
                {visible.map((meal) => (
                  <MealCard
                    key={meal.id}
                    meal={meal}
                    width={cardWidth}
                    showCalories={nutritionFlags.calories}
                    showProtein={nutritionFlags.protein}
                    onPress={() => openMeal(meal)}
                  />
                ))}
              </View>
            )}
          </ScrollView>
        </Animated.View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: Spacing[5],
    paddingBottom: 12,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  title: {
    fontSize: FontSize['1.5xl'],
    fontWeight: FontWeight.semibold as '600',
    letterSpacing: -0.5,
  },
  segments: { flexDirection: 'row', borderRadius: Radius.full, padding: 3, marginTop: 12, maxWidth: 420 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: Radius.full },
  segmentText: { fontSize: FontSize.sm },
  chips: { gap: 6, paddingTop: 12 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.full,
  },
  toggleText: { fontSize: FontSize.sm },
  scroll: {
    paddingTop: Spacing[4],
    paddingHorizontal: Spacing[5],
    gap: Spacing[4],
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
});
