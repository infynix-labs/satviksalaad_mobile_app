import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import React, { useMemo, useRef, useState } from 'react';
import { LayoutAnimation, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import type { ScrollViewInstance } from 'react-native';

import { Text } from '@/components/ui/text';
import { column, READING_WIDTH } from '@/constants/layout';
import { Brand, CardEdge, FontSize, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useQueryFocusRefetch } from '@/hooks/useQueryFocusRefetch';
import { menuApi } from '@/lib/api';
import { istDate } from '@/lib/delivery-rules';
import { optimizedImageSource } from '@/lib/image-url';
import { asyncPersister, CACHE_TTL } from '@/lib/query-client';
import type { DayMenu, MenuMonth } from '@/types/api';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DATE_WIDTH = 44;

/** A dish on the delivery menu that is also a bowl in the catalogue. */
export interface MenuBowl {
  imageUrl: string | null;
  facts: string | null;
  open: () => void;
}

/** The published months, or just the next seven days when the month view can't be loaded. */
export function useMonthlyMenu() {
  const monthly = useQuery({
    queryKey: ['monthly-menu'],
    queryFn: menuApi.monthly,
    staleTime: CACHE_TTL.menu,
    persister: asyncPersister.persisterFn,
  });
  const daily = useQuery({
    queryKey: ['daily-menu'],
    queryFn: menuApi.daily,
    staleTime: CACHE_TTL.menu,
    persister: asyncPersister.persisterFn,
    enabled: monthly.isError,
  });
  useQueryFocusRefetch(['monthly-menu']);

  const months = useMemo<MenuMonth[]>(() => {
    if (monthly.data) return monthly.data.data.months;
    const week = daily.data?.data.week ?? [];
    return week.length > 0 ? [{ month: 'week', name: 'This week', note: null, weeks: [{ number: 0, days: week }] }] : [];
  }, [monthly.data, daily.data]);

  return {
    months,
    isLoading: monthly.isLoading || (monthly.isError && daily.isLoading),
    refetch: async () => {
      await (monthly.isError ? Promise.all([monthly.refetch(), daily.refetch()]) : monthly.refetch());
    },
  };
}

function parts(date: string) {
  const [, month, day] = date.split('-').map(Number);
  return { day, month: MONTHS[month - 1] ?? '' };
}

function weekRange(days: DayMenu[]): string {
  const first = parts(days[0].date);
  const last = parts(days[days.length - 1].date);
  if (days.length === 1) return `${first.day} ${first.month}`;
  return first.month === last.month
    ? `${first.day}–${last.day} ${last.month}`
    : `${first.day} ${first.month} – ${last.day} ${last.month}`;
}

/** Today's delivery day, else the next one, else the month's first. */
function defaultDay(month: MenuMonth | undefined, today: string): string | null {
  const dates = month?.weeks.flatMap((w) => w.days.map((d) => d.date)) ?? [];
  return dates.find((d) => d >= today) ?? dates[0] ?? null;
}

interface Props {
  months: MenuMonth[];
  /** The catalogue bowl with this name, if there is one. */
  bowlFor: (name: string) => MenuBowl | undefined;
  refreshing: boolean;
  onRefresh: () => void;
}

/** The month's salad for every delivery day, week by week as on the printed menu; a day opens to its soup, juice and bowl. */
export function DeliveryMenu({ months, bowlFor, refreshing, onRefresh }: Props) {
  const { colors, fonts } = useTheme();
  const today = istDate();
  const [monthIndex, setMonthIndex] = useState(0);
  const month = months[Math.min(monthIndex, months.length - 1)];
  const [openDay, setOpenDay] = useState(() => defaultDay(month, today));
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrolledTo = useRef<string | null>(null);

  if (!month) return null;
  const openWeek = Math.max(0, month.weeks.findIndex((w) => w.days.some((d) => d.date === openDay)));

  function pickMonth(index: number) {
    if (index === monthIndex) return;
    void Haptics.selectionAsync().catch(() => {});
    setMonthIndex(index);
    setOpenDay(defaultDay(months[index], today));
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  function toggleDay(date: string) {
    void Haptics.selectionAsync().catch(() => {});
    LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
    setOpenDay((current) => (current === date ? null : date));
  }

  return (
    <ScrollView
      ref={scrollRef}
      showsVerticalScrollIndicator={false}
      stickyHeaderIndices={month.weeks.map((_, i) => 1 + i * 2)}
      contentContainerStyle={[column(READING_WIDTH), s.scroll]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <View style={s.intro}>
        {months.length > 1 ? (
          <View style={s.months} accessibilityRole="tablist">
            {months.map((m, i) => {
              const active = m === month;
              return (
                <TouchableOpacity
                  key={m.month}
                  onPress={() => pickMonth(i)}
                  activeOpacity={0.8}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  style={[s.monthTab, { backgroundColor: active ? colors.primary : colors.surface2 }]}
                >
                  <Text
                    style={[
                      s.monthTabText,
                      { color: active ? colors.textOnPrimary : colors.textMuted, fontFamily: active ? fonts.bodySemibold : fonts.body },
                    ]}
                  >
                    {m.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <Text style={[s.monthTitle, { color: colors.text, fontFamily: fonts.display }]}>{month.name}</Text>
        )}
        <Text style={[s.lede, { color: colors.textMuted, fontFamily: fonts.body }]}>
          A different salad every delivery day. Tap a day for its soup and juice.
        </Text>
        {month.note ? (
          <View style={[s.note, { backgroundColor: colors.accentBg }]}>
            <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
            <Text style={[s.noteText, { color: colors.text, fontFamily: fonts.body }]}>{month.note}</Text>
          </View>
        ) : null}
      </View>

      {month.weeks.flatMap((week, i) => {
        const thisWeek = week.days[0].date <= today && today <= week.days[week.days.length - 1].date;
        return [
          <View
            key={`${month.month}-h${week.number}`}
            style={[s.weekHead, { backgroundColor: colors.background }]}
            onLayout={(e) => {
              if (i !== openWeek || scrolledTo.current === month.month) return;
              scrolledTo.current = month.month;
              if (i > 0) scrollRef.current?.scrollTo({ y: e.nativeEvent.layout.y, animated: false });
            }}
          >
            {/* React Native moves a sticky header's style to a wrapper around it, so the row needs its own view. */}
            <View style={s.weekHeadRow}>
              <Text style={[s.weekLabel, { color: colors.primary, fontFamily: fonts.bodySemibold }]}>
                {week.number > 0 ? `WEEK ${String(week.number).padStart(2, '0')}` : 'NEXT 7 DAYS'}
              </Text>
              {thisWeek && week.number > 0 ? (
                <View style={[s.pill, { backgroundColor: colors.primaryBg }]}>
                  <Text style={[s.pillText, { color: colors.onPrimaryBg, fontFamily: fonts.bodySemibold }]}>This week</Text>
                </View>
              ) : null}
              <Text style={[s.weekRange, { color: colors.textMuted, fontFamily: fonts.bodyMedium }]}>{weekRange(week.days)}</Text>
            </View>
          </View>,
          <View key={`${month.month}-w${week.number}`} style={[s.card, { backgroundColor: colors.surface }, CardEdge]}>
            {week.days.map((day, j) => (
              <DayRow
                key={day.date}
                day={day}
                today={today}
                open={openDay === day.date}
                first={j === 0}
                bowl={day.salad ? bowlFor(day.salad) : undefined}
                onToggle={() => toggleDay(day.date)}
              />
            ))}
          </View>,
        ];
      })}
    </ScrollView>
  );
}

interface DayRowProps {
  day: DayMenu;
  today: string;
  open: boolean;
  first: boolean;
  bowl: MenuBowl | undefined;
  onToggle: () => void;
}

function DayRow({ day, today, open, first, bowl, onToggle }: DayRowProps) {
  const { colors, fonts } = useTheme();
  const isToday = day.date === today;
  const past = day.date < today;
  const { day: dayNumber, month } = parts(day.date);
  const sides = [
    { label: 'Soup', icon: 'cafe-outline' as const, name: day.soup },
    { label: 'Juice', icon: 'water-outline' as const, name: day.juice },
  ].filter((side): side is typeof side & { name: string } => Boolean(side.name));
  const expandable = Boolean(bowl) || sides.length > 0;
  const photo = bowl ? optimizedImageSource(bowl.imageUrl) : null;
  const expanded = open && expandable;

  return (
    <View
      style={[
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
        expanded && { backgroundColor: colors.primaryTint },
      ]}
    >
      <TouchableOpacity
        onPress={onToggle}
        disabled={!expandable}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={expandable ? { expanded } : undefined}
        accessibilityLabel={`${day.weekdayName} ${dayNumber} ${month}${isToday ? ', today' : ''}: ${day.salad ?? 'no salad'}`}
        style={[s.row, past && !expanded && s.past]}
      >
        <View style={[s.date, isToday && { backgroundColor: colors.primary }]}>
          <Text style={[s.weekday, { color: isToday ? colors.textOnPrimary : colors.textMuted, fontFamily: fonts.bodySemibold }]}>
            {WEEKDAYS[day.weekday]?.toUpperCase()}
          </Text>
          <Text style={[s.dayNumber, { color: isToday ? colors.textOnPrimary : colors.text, fontFamily: fonts.bodySemibold }]}>
            {String(dayNumber).padStart(2, '0')}
          </Text>
        </View>
        <View style={s.rowBody}>
          {isToday ? (
            <Text style={[s.todayLabel, { color: colors.primary, fontFamily: fonts.bodySemibold }]}>TODAY</Text>
          ) : null}
          <Text
            style={[s.salad, { color: day.salad ? colors.text : colors.textMuted, fontFamily: fonts.bodySemibold }]}
            numberOfLines={expanded ? undefined : 2}
          >
            {day.salad ?? 'No salad this day'}
          </Text>
        </View>
        {expandable ? (
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
        ) : null}
      </TouchableOpacity>

      {expanded ? (
        <View style={s.detail}>
          {sides.map((side) => (
            <View key={side.label} style={s.side}>
              <Ionicons name={side.icon} size={15} color={colors.primary} />
              <Text style={[s.sideLabel, { color: colors.textMuted, fontFamily: fonts.bodyMedium }]}>{side.label}</Text>
              <Text style={[s.sideName, { color: colors.text, fontFamily: fonts.bodyMedium }]}>{side.name}</Text>
            </View>
          ))}
          {bowl ? (
            <TouchableOpacity
              onPress={bowl.open}
              activeOpacity={0.85}
              accessibilityRole="link"
              accessibilityLabel={`See the ${day.salad} bowl`}
              style={[s.bowl, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              {photo ? (
                <View style={[s.bowlPhoto, { backgroundColor: Brand.sageLight }]}>
                  <Image source={photo} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={150} />
                </View>
              ) : null}
              <View style={s.bowlText}>
                <Text style={[s.bowlTitle, { color: colors.text, fontFamily: fonts.bodySemibold }]}>See the bowl</Text>
                <Text style={[s.bowlFacts, { color: colors.textMuted, fontFamily: fonts.body }]} numberOfLines={1}>
                  {bowl.facts ?? 'Ingredients and nutrition'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.primary} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { paddingHorizontal: Spacing[5], paddingBottom: Spacing[8] },
  intro: { paddingTop: Spacing[4], gap: Spacing[2] },
  months: { flexDirection: 'row', gap: 6 },
  monthTab: { paddingHorizontal: Spacing[4], paddingVertical: 8, borderRadius: Radius.full },
  monthTabText: { fontSize: FontSize.sm },
  monthTitle: { fontSize: FontSize.xl },
  lede: { fontSize: FontSize.sm, lineHeight: FontSize.sm * 1.4 },
  note: { flexDirection: 'row', gap: Spacing[2], borderRadius: Radius.md, padding: Spacing[3], marginTop: Spacing[1] },
  noteText: { flex: 1, fontSize: FontSize.sm, lineHeight: FontSize.sm * 1.4 },
  weekHead: { paddingTop: Spacing[5], paddingBottom: Spacing[2] },
  weekHeadRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  weekLabel: { fontSize: FontSize.xs, letterSpacing: 1.1 },
  pill: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 10, letterSpacing: 0.3 },
  weekRange: { marginLeft: 'auto', fontSize: FontSize.xs },
  card: { borderRadius: Radius.xl, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], paddingHorizontal: Spacing[3], paddingVertical: Spacing[2], minHeight: 60 },
  past: { opacity: 0.5 },
  date: { width: DATE_WIDTH, height: DATE_WIDTH, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  weekday: { fontSize: 10, letterSpacing: 0.6 },
  dayNumber: { fontSize: FontSize.lg, lineHeight: FontSize.lg * 1.15, fontVariant: ['tabular-nums'] },
  rowBody: { flex: 1, gap: 1 },
  todayLabel: { fontSize: 10, letterSpacing: 1 },
  salad: { fontSize: FontSize.base, lineHeight: FontSize.base * 1.3 },
  detail: { paddingLeft: Spacing[3] + DATE_WIDTH + Spacing[3], paddingRight: Spacing[3], paddingBottom: Spacing[3], gap: Spacing[2] },
  side: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sideLabel: { fontSize: FontSize.xs, width: 38 },
  sideName: { flex: 1, fontSize: FontSize.sm },
  bowl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing[2],
    marginTop: 2,
  },
  bowlPhoto: { width: 48, height: 48, borderRadius: Radius.sm, overflow: 'hidden' },
  bowlText: { flex: 1, gap: 1 },
  bowlTitle: { fontSize: FontSize.sm },
  bowlFacts: { fontSize: FontSize.xs },
});
