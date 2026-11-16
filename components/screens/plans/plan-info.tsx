import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { LayoutAnimation, StyleSheet, TouchableOpacity, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Brand, CardEdge, FontSize, LineHeight, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { zonesApi } from '@/lib/api';
import { formatGstRate } from '@/lib/gst';
import { CACHE_TTL } from '@/lib/query-client';
import { useWhatsAppOrdering } from '@/lib/whatsapp-ordering';
import type { Plan } from '@/types/api';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const CHANGE_CUTOFFS = 'Lunch changes close at 10 PM the night before; dinner changes close at 12 PM the same day.';
const SUNDAY_NOTE =
  'Sunday delivery is free within 3 km of our Prahladnagar outlet. Further away, book a Porter from the outlet at your own cost.';
const DELIVERY_CHARGES = 'Free within 10 km of our Prahladnagar outlet, ₹50 for 10–15 km.';
const SLOT_TIMES = 'lunch between 8:00 AM and 1:00 PM, dinner between 4:00 PM and 8:30 PM';

function facts(plans: Plan[]): { icon: IconName; title: string; text: string }[] {
  const unit = plans.find((p) => !p.is_trial)?.unit?.singular ?? 'bowl';
  const graceDays = plans.length > 0 ? Math.max(...plans.map((p) => p.grace_days)) : 15;
  const stylePlan = plans.find((p) => p.style_choice);
  return [
    {
      icon: 'sparkles-outline',
      title: 'Your style',
      text: stylePlan
        ? `Salad plans bring our regular bowls. Choose High-protein or Disease-friendly with the ${stylePlan.name} plan.`
        : 'Planned around your health goals and medical conditions. Your favourites, no dislikes.',
    },
    {
      icon: 'calendar-outline',
      title: 'Valid till',
      text: `The day your last ${unit} is due. Skip a day and that ${unit} moves to the end, up to ${graceDays} extra days.`,
    },
    { icon: 'time-outline', title: 'Skip or change', text: CHANGE_CUTOFFS },
    { icon: 'sunny-outline', title: 'Sunday is optional', text: SUNDAY_NOTE },
    { icon: 'bicycle-outline', title: 'Delivery', text: DELIVERY_CHARGES },
  ];
}

function questions(plans: Plan[], gstRateBps: number, showPayment: boolean): { q: string; a: string }[] {
  const stylePlan = plans.find((p) => p.style_choice);
  const graceDays = plans.length > 0 ? Math.max(...plans.map((p) => p.grace_days)) : 15;
  return [
    {
      q: 'Does my plan renew automatically?',
      a: "No. A plan covers the bowls you chose and nothing renews by itself. Choose a new plan whenever you're ready.",
    },
    ...(showPayment
      ? [
          {
            q: 'How do I pay?',
            a: `At checkout, through Razorpay: UPI (Google Pay, PhonePe, Paytm or any UPI app), debit or credit card, or net banking. The payment page is Razorpay's own, so we never see your card or bank details.${gstRateBps > 0 ? ` Prices are plus ${formatGstRate(gstRateBps)} GST, shown and added at checkout.` : ''}`,
          },
        ]
      : []),
    {
      q: 'When do the bowls arrive?',
      a: `Monday to Saturday, ${SLOT_TIMES}. You choose lunch or dinner when you subscribe. ${SUNDAY_NOTE}`,
    },
    {
      q: 'Can I skip a day?',
      a: `Yes, from the Deliveries tab. ${CHANGE_CUTOFFS} A skipped bowl moves to the end of your plan, up to ${graceDays} extra days; bowls still undelivered after that expire.`,
    },
    ...(stylePlan
      ? [
          {
            q: "What's different about the High-protein and Disease-friendly bowls?",
            a: `Our regular salad plans bring our regular bowls. With the ${stylePlan.name} plan you choose high-protein bowls, or bowls planned around a medical condition.`,
          },
        ]
      : []),
    {
      q: 'Is everything vegetarian?',
      a: 'Yes, every dish is 100% vegetarian. Our menu marks Jain, vegan and gluten-free dishes, and you can tell us your food preferences at checkout.',
    },
    {
      q: 'Where do you deliver, and what does it cost?',
      a: `Across Ahmedabad. ${DELIVERY_CHARGES} The areas we cover are listed below.`,
    },
    ...(showPayment
      ? [
          {
            q: 'Can I get a refund?',
            a: "Before your first delivery, yes: contact us and we'll refund what you paid. Once deliveries start, plans aren't refundable unless the problem is on our side. If a bowl arrives damaged or wrong, message us the same day with a photo and we'll make it right.",
          },
        ]
      : []),
  ];
}

interface PlansInfoProps {
  plans: Plan[];
  gstRateBps: number;
  onDietConsultation: () => void;
  style?: object;
}

/** What to know before buying: payment, the diet combo, plan rules, questions and the areas delivered to. */
export function PlansInfo({ plans, gstRateBps, onDietConsultation, style }: PlansInfoProps) {
  const { colors, fonts } = useTheme();
  const [openQuestion, setOpenQuestion] = useState<number | null>(null);
  const whatsappOrdering = useWhatsAppOrdering();
  const { data: zones } = useQuery({ queryKey: ['zones'], queryFn: zonesApi.list, staleTime: CACHE_TTL.plans });
  const zoneList = zones?.data ?? [];
  const regions = [...new Set(zoneList.map((z) => z.region))].map((region) => ({
    region,
    names: [...new Set(zoneList.filter((z) => z.region === region).map((z) => z.name))].sort((a, b) => a.localeCompare(b)),
  }));

  function toggle(index: number) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenQuestion((current) => (current === index ? null : index));
  }

  return (
    <View style={[s.root, style]}>
      {whatsappOrdering ? null : (
        <View style={[s.payCard, { backgroundColor: colors.primaryTint }]}>
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.primaryDark} />
          <View style={s.payText}>
            <Text style={[s.payTitle, { color: colors.primaryDark, fontFamily: fonts.bodySemibold }]}>
              Secure payment by Razorpay
            </Text>
            <Text style={[s.small, { color: colors.primaryDark, fontFamily: fonts.body }]}>
              UPI · Cards · Net banking
              {gstRateBps > 0 ? ` · Prices are plus ${formatGstRate(gstRateBps)} GST, added at checkout` : ''}
            </Text>
          </View>
        </View>
      )}

      <View style={[s.combo, { backgroundColor: Brand.forest }]}>
        <View style={s.comboHead}>
          <Text style={[s.comboTitle, { color: colors.textOnPrimary, fontFamily: fonts.display }]}>Diet + Meal Combo</Text>
          <View style={[s.comboBadge, { backgroundColor: colors.accent }]}>
            <Text style={[s.comboBadgeText, { fontFamily: fonts.bodyBold }]}>RECOMMENDED</Text>
          </View>
        </View>
        <Text style={[s.small, { color: colors.textOnPrimary, opacity: 0.8, fontFamily: fonts.body }]}>
          With clinical dietitian Divya Agrawal. For weight loss, lifestyle disorders and busy schedules.
        </Text>
        {['Personalised diet plan', 'Salads curated to your goals', 'Portion control & follow-ups'].map((item) => (
          <View key={item} style={s.comboItem}>
            <Ionicons name="checkmark" size={14} color={colors.accent} />
            <Text style={[s.small, { color: colors.textOnPrimary, fontFamily: fonts.body }]}>{item}</Text>
          </View>
        ))}
        <TouchableOpacity
          onPress={onDietConsultation}
          activeOpacity={0.85}
          accessibilityRole="button"
          style={[s.comboBtn, { backgroundColor: colors.accent }]}
        >
          <Text style={[s.comboBtnText, { fontFamily: fonts.bodySemibold }]}>See diet consultation</Text>
        </TouchableOpacity>
      </View>

      <View>
        <Text style={[s.heading, { color: colors.text, fontFamily: fonts.display }]}>Good to know</Text>
        <View style={[s.card, { backgroundColor: colors.surface }, CardEdge]}>
          {facts(plans).map((fact, i) => (
            <View
              key={fact.title}
              style={[s.fact, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
            >
              <View style={[s.factIcon, { backgroundColor: colors.primaryBg }]}>
                <Ionicons name={fact.icon} size={15} color={colors.primary} />
              </View>
              <View style={s.factText}>
                <Text style={[s.factTitle, { color: colors.text, fontFamily: fonts.bodySemibold }]}>{fact.title}</Text>
                <Text style={[s.small, { color: colors.textMuted, fontFamily: fonts.body }]}>{fact.text}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View>
        <Text style={[s.heading, { color: colors.text, fontFamily: fonts.display }]}>Questions</Text>
        <View style={[s.card, { backgroundColor: colors.surface }, CardEdge]}>
          {questions(plans, gstRateBps, !whatsappOrdering).map((item, i) => {
            const open = openQuestion === i;
            return (
              <View key={item.q} style={i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                <TouchableOpacity
                  onPress={() => toggle(i)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  style={s.question}
                >
                  <Text style={[s.questionText, { color: colors.text, fontFamily: fonts.bodySemibold }]}>{item.q}</Text>
                  <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
                </TouchableOpacity>
                {open ? (
                  <Text style={[s.answer, { color: colors.textSecondary, fontFamily: fonts.body }]}>{item.a}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>

      {regions.length > 0 ? (
        <View style={s.regions}>
          <Text style={[s.heading, { color: colors.text, fontFamily: fonts.display }]}>Areas we deliver to</Text>
          {regions.map(({ region, names }) => (
            <View key={region} style={s.region}>
              <Text style={[s.regionLabel, { color: colors.textMuted, fontFamily: fonts.bodySemibold }]}>
                {region.toUpperCase()}
              </Text>
              <View style={s.areas}>
                {names.map((area) => (
                  <View key={area} style={[s.area, { backgroundColor: colors.surface2 }]}>
                    <Text style={[s.areaText, { color: colors.text, fontFamily: fonts.body }]}>{area}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { gap: Spacing[5] },
  small: { fontSize: FontSize.xs, lineHeight: FontSize.xs * LineHeight.normal },
  heading: { fontSize: FontSize.lg, marginBottom: Spacing[2] },

  payCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3], padding: Spacing[4], borderRadius: Radius.lg },
  payText: { flex: 1, gap: 2 },
  payTitle: { fontSize: FontSize.sm },

  combo: { borderRadius: Radius.xl, padding: Spacing[4], gap: Spacing[2] },
  comboHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing[2] },
  comboTitle: { fontSize: FontSize.lg },
  comboBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  comboBadgeText: { fontSize: 10, letterSpacing: 0.6, color: '#1D1A12' },
  comboItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  comboBtn: { marginTop: Spacing[1], height: 42, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  comboBtnText: { fontSize: FontSize.sm, color: '#1D1A12' },

  card: { borderRadius: Radius.lg, overflow: 'hidden' },
  fact: { flexDirection: 'row', gap: Spacing[3], padding: Spacing[4] },
  factIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  factText: { flex: 1, gap: 2 },
  factTitle: { fontSize: FontSize.sm },

  question: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingHorizontal: Spacing[4], paddingVertical: Spacing[3] },
  questionText: { flex: 1, fontSize: FontSize.sm },
  answer: {
    fontSize: FontSize.sm,
    lineHeight: FontSize.sm * LineHeight.normal,
    paddingHorizontal: Spacing[4],
    paddingBottom: Spacing[3],
  },

  regions: { gap: Spacing[3] },
  region: { gap: 6 },
  regionLabel: { fontSize: 11, letterSpacing: 0.8 },
  areas: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  area: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5 },
  areaText: { fontSize: FontSize.xs },
});
