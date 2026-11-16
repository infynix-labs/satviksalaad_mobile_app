import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Text } from '@/components/ui/text';
import { BackButton } from '@/components/ui/screen-header';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { BottomActionBar } from '@/components/ui/bottom-action-bar';
import { Skeleton } from '@/components/skeleton';
import { Brand, CardEdge, FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';
import { column } from '@/constants/layout';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { optimizedImageSource } from '@/lib/image-url';
import { DietBadges } from '@/components/screens/menu/diet-badges';
import { readHomeCache } from '@/lib/home-cache';
import type { HomeCriticalResponse, SubscriptionsResponse } from '@/types/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AVAILABILITY = 'Lunch & dinner';

// ─── Nutrition cell ───────────────────────────────────────────────────────────

function NutritionCell({
  value,
  label,
  colors,
  fonts,
}: {
  value: string;
  label: string;
  colors: ReturnType<typeof useTheme>['colors'];
  fonts: ReturnType<typeof useTheme>['fonts'];
}) {
  return (
    <View style={[styles.nutritionCell, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
      <Text style={[styles.nutritionValue, { color: colors.text, fontFamily: fonts.display }]}>{value}</Text>
      <Text style={[styles.nutritionLabel, { color: colors.textMuted, fontFamily: fonts.body }]}>{label}</Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function MealDetailScreen() {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const params = useLocalSearchParams<{
    id?: string;
    name?: string;
    imageUrl?: string;
    kcal?: string;
    protein?: string;
    fiber?: string;
    carbs?: string;
    fat?: string;
    category?: string;
    categoryName?: string;
    dietLabels?: string;
    description?: string;
    ingredients?: string;
    showCalories?: string;
    showProtein?: string;
    showFiber?: string;
    showCarbs?: string;
    showFat?: string;
  }>();

  const name        = params.name ?? 'Salad Bowl';
  const imageUrl    = params.imageUrl && params.imageUrl.length > 0 ? params.imageUrl : null;
  const kcal        = parseInt(params.kcal ?? '0', 10);
  const protein     = parseInt(params.protein ?? '0', 10);
  const fiber       = parseInt(params.fiber ?? '0', 10);
  const carbs       = parseInt(params.carbs ?? '0', 10);
  const fat         = parseInt(params.fat ?? '0', 10);
  const category    = params.category ?? 'salad';
  const categoryName = params.categoryName || (category === 'fruit' ? 'Fruit Bowl' : 'Salad Bowl');
  const dietLabels  = params.dietLabels ? params.dietLabels.split(',').filter(Boolean) : [];
  const description = params.description && params.description.length > 0 ? params.description : null;
  const ingredients = params.ingredients && params.ingredients.length > 0
    ? params.ingredients.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const showCalories = params.showCalories !== 'false';
  const showProtein  = params.showProtein  !== 'false';
  const showFiber    = params.showFiber    === 'true';
  const showCarbs    = params.showCarbs    !== 'false';
  const showFat      = params.showFat      !== 'false';

  const isFruit  = category === 'fruit';
  const [heroLoaded, setHeroLoaded] = useState(false);

  const hasNutrition =
    (showCalories && kcal > 0) ||
    (showProtein  && protein > 0) ||
    (showFiber    && fiber > 0) ||
    (showCarbs    && carbs > 0) ||
    (showFat      && fat > 0);

  // Read synchronously — in-memory React Query cache first, MMKV fallback.
  // No API call needed: user always arrives here from home/menu tabs where home data is loaded.
  const { hasSubscription, endedSubscription } = useMemo(() => {
    const userId = session?.user?.id ?? null;
    const home = queryClient.getQueryData<HomeCriticalResponse>(['home'])?.data ?? (userId ? readHomeCache(userId)?.home : null);
    const everHeld = queryClient.getQueryData<SubscriptionsResponse>(['subscriptions'])?.data ?? [];
    const has = (home?.subscriptions ?? []).some((s) => s.category === category);
    return { hasSubscription: has, endedSubscription: !has && everHeld.some((s) => s.category === category) };
  }, [queryClient, session?.user?.id, category]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Spacing[5] }}>

        {/* ── Hero image ── */}
        <View style={[styles.hero, { height: Math.min(width * (9 / 16), HERO_MAX_HEIGHT) }]}>
          <Image
            source={
              optimizedImageSource(imageUrl)
              ?? require('@/assets/images/hero-image.png')
            }
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
            onLoad={() => setHeroLoaded(true)}
          />
          {!heroLoaded && (
            <Skeleton width="100%" height={220} radius={0} style={{ ...StyleSheet.absoluteFill }} />
          )}

          {/* A scrim rather than a button box keeps the white arrow legible on any photo. */}
          <LinearGradient
            colors={['rgba(0,0,0,0.42)', 'transparent']}
            style={[styles.topScrim, { height: insets.top + 72 }]}
            pointerEvents="none"
          />
          <View style={[styles.overlayBack, { top: insets.top + 14, left: Spacing[5] }]}>
            <BackButton onPress={() => router.back()} color="#fff" />
          </View>

          {/* Availability badge — bottom-left of hero */}
          <View style={[styles.heroDayBadge, { bottom: 18, left: 18 }]}>
            <Text style={[styles.heroDayText, { fontFamily: fonts.bodyMedium }]}>{AVAILABILITY}</Text>
          </View>
        </View>

        {/* ── Content ── */}
        <View style={[styles.content, column()]}>
          {/* Category pill */}
          <View style={styles.pillsRow}>
            <View style={[styles.pill, { backgroundColor: isFruit ? colors.orangeBg : colors.primaryBg }]}>
              <Ionicons
                name={isFruit ? 'nutrition-outline' : 'leaf-outline'}
                size={11}
                color={isFruit ? colors.orange : colors.primaryDark}
              />
              <Text style={[styles.pillText, { color: isFruit ? colors.orange : colors.primaryDark, fontFamily: fonts.bodySemibold }]}>
                {categoryName}
              </Text>
            </View>
            <View style={[styles.pill, { backgroundColor: colors.surface2, borderColor: colors.border, borderWidth: 1 }]}>
              <Ionicons name="calendar-outline" size={11} color={colors.textMuted} />
              <Text style={[styles.pillText, { color: colors.textMuted, fontFamily: fonts.bodyMedium }]}>
                {AVAILABILITY}
              </Text>
            </View>
          </View>

          {/* Meal name */}
          <Text style={[styles.mealName, { color: colors.text, fontFamily: fonts.display }]}>
            {name}
          </Text>
          <DietBadges labels={dietLabels} />

          {/* Description */}
          {description ? (
            <Text style={[styles.description, { color: colors.textMuted, fontFamily: fonts.body }]}>
              {description}
            </Text>
          ) : null}

          {/* Ingredients chips */}
          {ingredients.length > 0 && (
            <View style={styles.ingredientsSection}>
              <Text style={[styles.ingredientsLabel, { color: colors.text, fontFamily: fonts.bodySemibold }]}>
                Ingredients
              </Text>
              <View style={styles.ingredientsRow}>
                {ingredients.map((ing, i) => (
                  <View key={i} style={[styles.ingredientChip, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                    <Text style={[styles.ingredientChipText, { color: colors.text, fontFamily: fonts.body }]}>{ing}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Nutrition grid */}
          {hasNutrition && (
            <View style={styles.nutritionGrid}>
              {showCalories && kcal > 0 && (
                <NutritionCell value={`${kcal}`} label="KCAL" colors={colors} fonts={fonts} />
              )}
              {showProtein && protein > 0 && (
                <NutritionCell value={`${protein}g`} label="PROTEIN" colors={colors} fonts={fonts} />
              )}
              {showFiber && fiber > 0 && (
                <NutritionCell value={`${fiber}g`} label="FIBER" colors={colors} fonts={fonts} />
              )}
              {showCarbs && carbs > 0 && (
                <NutritionCell value={`${carbs}g`} label="CARBS" colors={colors} fonts={fonts} />
              )}
              {showFat && fat > 0 && (
                <NutritionCell value={`${fat}g`} label="FAT" colors={colors} fonts={fonts} />
              )}
            </View>
          )}

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

          {/* Info rows */}
          <View style={[styles.infoCard, { backgroundColor: colors.surface, borderWidth: 0 }, CardEdge]}>
            <InfoRow icon="checkmark-circle-outline" label="DIETARY" value="100% Pure Veg · No preservatives" colors={colors} fonts={fonts} />
          </View>

          {/* Plan nudge — only shown without a subscription */}
          {!hasSubscription && (
            <View style={[styles.nudgeCard, { backgroundColor: isFruit ? colors.orangeBg : colors.primaryTint, borderColor: 'transparent' }]}>
              <Ionicons name="sparkles-outline" size={16} color={isFruit ? colors.orange : colors.primaryDark} />
              <Text style={[styles.nudgeText, { color: isFruit ? colors.orange : colors.primaryDark, fontFamily: fonts.body }]}>
                {endedSubscription
                  ? 'This bowl is part of our subscriptions. Renew to get it delivered.'
                  : 'This bowl is part of our subscriptions. Choose a plan to get it delivered.'}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Fixed bottom CTA ── */}
      {(
        <BottomActionBar style={{ backgroundColor: colors.background, borderTopWidth: 0 }}>
          {hasSubscription ? (
            <TouchableOpacity
              style={[styles.ctaBtn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}
              activeOpacity={0.85}
              onPress={() => router.push('/(tabs)/deliveries')}>
              <Ionicons name="albums-outline" size={18} color={colors.primary} />
              <Text style={[styles.ctaBtnText, { fontFamily: fonts.bodySemibold, color: colors.primary }]}>
                Manage Deliveries
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.ctaBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.85}
              onPress={() => router.push('/plans')}>
              <Ionicons name="bag-handle-outline" size={18} color="#fff" />
              <Text style={[styles.ctaBtnText, { fontFamily: fonts.bodySemibold }]}>
                {endedSubscription ? 'Renew' : 'Choose a plan'}
              </Text>
            </TouchableOpacity>
          )}
        </BottomActionBar>
      )}
    </View>
  );
}

// ─── InfoRow ──────────────────────────────────────────────────────────────────

function InfoRow({
  icon, label, value, colors, fonts,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  colors: ReturnType<typeof useTheme>['colors'];
  fonts: ReturnType<typeof useTheme>['fonts'];
}) {
  return (
    <View style={styles.infoRow}>
      <View style={[styles.infoIconWrap, { backgroundColor: colors.surface2 }]}>
        <Ionicons name={icon} size={14} color={colors.textMuted} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.infoRowLabel, { color: colors.textMuted, fontFamily: fonts.body }]}>{label}</Text>
        <Text style={[styles.infoRowValue, { color: colors.text, fontFamily: fonts.bodySemibold }]}>{value}</Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

// A 16:9 photo at tablet width would fill most of the screen.
const HERO_MAX_HEIGHT = 440;

const styles = StyleSheet.create({
  root: { flex: 1 },

  hero: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: Brand.sageLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0 },
  overlayBack: { position: 'absolute' },
  heroDayBadge: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.48)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  heroDayText: {
    fontSize: FontSize.xs,
    color: '#fff',
    letterSpacing: 0.3,
  },

  content: {
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[4],
    gap: Spacing[3],
  },

  pillsRow:  { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  pill:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full },
  pillText:  { fontSize: FontSize.xs },

  mealName: {
    fontSize: 30,
    fontWeight: FontWeight.semibold,
    letterSpacing: -0.8,
    lineHeight: 34,
  },

  description: {
    fontSize: FontSize.sm,
    lineHeight: FontSize.sm * 1.6,
    marginTop: -Spacing[1],
  },

  ingredientsSection: { gap: 8 },
  ingredientsLabel:   { fontSize: FontSize.sm },
  ingredientsRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ingredientChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  ingredientChipText: { fontSize: FontSize.xs },

  nutritionGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  nutritionCell: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    gap: 3,
  },
  nutritionValue: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  nutritionLabel: {
    fontSize: 9,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  divider: { height: 1 },

  infoCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: Spacing[4],
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingVertical: Spacing[2] + 2,
  },
  infoRowDivider: { height: 1 },
  infoIconWrap: {
    width: 30, height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoRowLabel: { fontSize: 9, letterSpacing: 0.4, marginBottom: 1 },
  infoRowValue: { fontSize: FontSize.sm },

  nudgeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2] + 2,
    padding: Spacing[4],
    borderRadius: 14,
    borderWidth: 1,
  },
  nudgeText: {
    flex: 1,
    fontSize: FontSize.sm,
    lineHeight: FontSize.sm * 1.5,
  },

  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    height: 52,
    borderRadius: Radius.full,
  },
  ctaBtnText: {
    fontSize: FontSize.base,
    color: '#fff',
  },
});
