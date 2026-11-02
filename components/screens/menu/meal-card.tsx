import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/ui/text';

import { Brand, CardEdge, FontSize, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { optimizedImageSource } from '@/lib/image-url';

import { DietBadges } from './diet-badges';

export const PHOTO_COMING_SOON = 'Photo coming soon. Our team is working on it.';

const THUMB = 88;

interface MealCardProps {
  meal: {
    name: string;
    description?: string | null;
    kcal: number | null;
    protein: number | null;
    imageUrl: string | null;
    dietLabels?: string[];
  };
  /** Card width, so a grid can size its columns. */
  width: number;
  showCalories?: boolean;
  showProtein?: boolean;
  onPress: () => void;
}

/** One menu item as a row: name, description, nutrition and diet marks, with a small photo on the right only when there is one. */
export function MealCard({ meal, width, showCalories = true, showProtein = true, onPress }: MealCardProps) {
  const { colors, fonts } = useTheme();
  const photo = optimizedImageSource(meal.imageUrl);
  const facts = [
    showCalories && (meal.kcal ?? 0) > 0 ? `${meal.kcal} kcal` : null,
    showProtein && (meal.protein ?? 0) > 0 ? `${meal.protein} g protein` : null,
  ].filter(Boolean);

  return (
    <TouchableOpacity
      style={[s.card, { width, backgroundColor: colors.surface }, CardEdge]}
      onPress={onPress}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={meal.name}
    >
      <View style={s.body}>
        <Text style={[s.name, { color: colors.text, fontFamily: fonts.bodySemibold }]} numberOfLines={2}>
          {meal.name}
        </Text>
        {meal.description ? (
          <Text style={[s.description, { color: colors.textSecondary, fontFamily: fonts.body }]} numberOfLines={2}>
            {meal.description}
          </Text>
        ) : null}
        {facts.length > 0 ? (
          <Text style={[s.facts, { color: colors.primary, fontFamily: fonts.bodyMedium }]} numberOfLines={1}>
            {facts.join(' · ')}
          </Text>
        ) : null}
        <DietBadges labels={meal.dietLabels} />
      </View>
      {photo ? (
        <View style={[s.photo, { backgroundColor: Brand.sageLight }]}>
          <Image
            source={photo}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
            recyclingKey={meal.imageUrl ?? undefined}
          />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    padding: Spacing[3],
  },
  photo: { width: THUMB, height: THUMB, borderRadius: Radius.md, overflow: 'hidden' },
  body: { flex: 1, gap: 4 },
  name: { fontSize: FontSize.base, lineHeight: FontSize.base * 1.3 },
  description: { fontSize: FontSize.sm, lineHeight: FontSize.sm * 1.35 },
  facts: { fontSize: FontSize.xs, marginTop: 2 },
});
