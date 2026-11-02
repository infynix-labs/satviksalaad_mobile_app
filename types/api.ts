// ─── Auth ─────────────────────────────────────────────────────────────────────
export interface OtpSendResponse {
  success: boolean;
  sessionId: string;
  channel: 'whatsapp' | 'sms';
  resendAfterSeconds?: number;
  error?: string;
}

export interface OtpVerifyResponse {
  success: boolean;
  /** Session bearer token. Absent when the caller was already signed in
   * (the OTP then only proved ownership of a number). */
  token?: string;
  isNewUser?: boolean;
  hasName?: boolean;
  error?: string;
}

// ─── Profile ──────────────────────────────────────────────────────────────────
export interface Profile {
  full_name: string | null;
  phone: string | null;
  email: string | null;
  role: 'customer' | 'delivery_partner';
}

export interface ProfileResponse {
  success: boolean;
  profile: Profile | null;
}

// ─── Addresses ────────────────────────────────────────────────────────────────
export interface DeliveryAddress {
  id: string;
  label: string | null;
  full_address: string;
  area: string;
  city: string;
  state: string;
  pincode: string | null;
  landmark: string | null;
  is_default: boolean;
  created_at: string;
}

export interface AddressesResponse {
  success: boolean;
  data: DeliveryAddress[];
}

export interface AddressResponse {
  success: boolean;
  data: DeliveryAddress;
}

export interface AddressPayload {
  label?: string | null;
  full_address: string;
  area: string;
  city?: string;
  state?: string;
  pincode?: string | null;
  landmark?: string | null;
  is_default?: boolean;
}

// ─── Subscriptions ────────────────────────────────────────────────────────────
/** How a category counts what it delivers, e.g. "bowl" / "bowls" or "bottle" / "bottles". */
export interface Units {
  singular: string;
  plural: string;
}

export interface CategoryInfo {
  slug: string;
  /** As the menu names it, e.g. "Salad Bowls". */
  name: string;
  unit: Units;
  image_url: string | null;
  sort_order: number;
}

/** Every menu category, by slug. */
export type Categories = Record<string, CategoryInfo>;

/** What is left in one category's running and waiting subscriptions. */
export interface CategoryLeft {
  left: number;
  unit: Units;
}

export type SubscriptionStatus = 'active' | 'upcoming' | 'completed' | 'expired' | 'refunded';

export interface Subscription {
  id: string;
  status: SubscriptionStatus;
  /** A customer holds at most one running subscription per category. */
  category: string;
  unit: Units;
  plan: {
    id: string | null;
    name: string;
    slug: string | null;
    category: string;
    bowls_count: number | null;
    is_trial: boolean;
    is_high_protein: boolean;
  };
  order_id: string | null;
  bowls_total: number;
  bowls_delivered: number;
  bowls_expired: number;
  bowls_revoked: number;
  bowls_left: number;
  bowls_scheduled: number;
  bowls_unscheduled: number;
  days_skipped: number;
  // These four are IST calendar dates, YYYY-MM-DD.
  starts_on: string;
  original_ends_on: string;
  ends_on: string;
  last_allowed_on: string;
  extension_days_used: number;
  extension_days_allowed: number;
  price_paise: number;
  paid_at: string | null;
  created_at: string;
}

export interface SubscriptionsResponse {
  success: boolean;
  /** Newest first. */
  data: Subscription[];
  meta: {
    current: Subscription | null;
    next: Subscription | null;
    /** One per category, oldest first. */
    running: Subscription[];
    waiting: Subscription[];
    /** Whether the default category's trial has been had. */
    trial_used: boolean;
    /** Whether each category's trial has been had; a category not listed has none used. */
    trial_used_by_category: Record<string, boolean>;
    /** Left in the default category only; `left_by_category` counts each in its own unit. */
    bowls_left: number;
    left_by_category: Record<string, CategoryLeft>;
    categories: Categories;
  };
}

export interface SubscriptionSyncResponse {
  success: boolean;
  added: number;
  removed: number;
}

export interface SubscriptionPreviewPayload {
  planId: string;
  preferredDays?: string[];
  timeSlotId?: string;
  firstDeliveryPreference?: FirstDeliveryPreference;
}

/** The days, time and address every subscription of the customer shares. */
export interface SharedSchedule {
  preferred_days: string[];
  delivery_slot: string;
  address: string | null;
}

export interface SubscriptionPreviewResponse {
  success: boolean;
  can_buy: boolean;
  /** Why it cannot be bought, as a sentence to show. */
  reason: string | null;
  code: 'trial_used' | 'renewal_exists' | null;
  /** True when it would start after the running subscription of its category. */
  queued: boolean;
  starts_on: string;
  ends_on: string;
  last_allowed_on: string;
  after: { plan_name: string; ends_on: string } | null;
  after_plan_name: string | null;
  trial_available: boolean;
  /** Set when the order would use the customer's own days, time and address instead of the ones sent. */
  your_schedule: SharedSchedule | null;
  /** The price before GST this account checks out at in place of the plan's; null for everyone else. */
  test_price_paise: number | null;
}

// ─── Delivery Schedules ───────────────────────────────────────────────────────
export interface DeliverySchedule {
  id: string;
  user_id: string;
  delivery_address_id: string | null;
  label: string;
  preferred_days: string[];
  delivery_slot: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Delivery Logs ────────────────────────────────────────────────────────────
export type DeliveryStatus =
  | 'scheduled'
  | 'out_for_delivery'
  | 'delivered'
  | 'missed'
  | 'skipped'
  | 'cancelled';

/** One item of a delivery: one category's row on that date and time. */
export interface DeliveryLog {
  id: string;
  user_id: string | null;
  delivery_date: string;
  delivery_slot: string;
  status: DeliveryStatus;
  delivered_at: string | null;
  quantity: number;
  meal_id: string | null;
  /** The meal on it, when it is one of the subscription menu's. */
  meal_name?: string | null;
  meal_image_url?: string | null;
  created_at: string | null;
  delivery_schedule_id?: string | null;
  subscription_id: string | null;
  category: string;
  unit: Units;
}

// ─── Plans ────────────────────────────────────────────────────────────────────
export interface Plan {
  id: string;
  slug?: string;
  name: string;
  category: string;
  /** The category's menu name, e.g. "Vegetable Juices". */
  category_name: string;
  unit: Units;
  unit_singular: string;
  unit_plural: string;
  bowls_count: number;
  price_paise: number;
  price_per_bowl_paise?: number;
  description?: string | null;
  features: string[];
  is_popular?: boolean;
  is_trial: boolean;
  is_high_protein: boolean;
  /** A short label for the plan card, e.g. "Launch offer". */
  badge?: string | null;
  /** The customer picks High-protein or Disease-friendly at checkout. */
  style_choice?: boolean;
  grace_days: number;
}

export interface PlansResponse {
  success: boolean;
  data: Plan[];
  /** `gstRateBps` is added on top of plan prices at checkout; older servers leave it out. */
  meta: { count: number; gstRateBps?: number };
}

// ─── Slots ────────────────────────────────────────────────────────────────────
export interface TimeSlot {
  id: string;
  label: string;
  time_range: string;
  icon: string | null;
}

export interface SlotsResponse {
  success: boolean;
  data: TimeSlot[];
}

// ─── Dietary options ──────────────────────────────────────────────────────────
export interface DietaryOption {
  key: string;
  label: string;
}

export interface DietaryOptionsResponse {
  success: boolean;
  data: DietaryOption[];
}

// ─── Orders ───────────────────────────────────────────────────────────────────
export interface CreateOrderPayload {
  planId: string;
  name: string;
  mobile: string;
  /** The next four are ignored for a renewal, which keeps the current days, slot and address. */
  timeSlotId?: string;
  area?: string;
  address?: string;
  preferredDays?: string[];
  specialInstructions?: string;
  dietaryPreferences?: string[];
  firstDeliveryPreference?: FirstDeliveryPreference;
}

/** "today" starts on the earliest day still open to change; "next_day" never before tomorrow. */
export type FirstDeliveryPreference = 'today' | 'next_day';

export interface CreateOrderResponse {
  success: boolean;
  orderId: string;
  renewal: boolean;
  starts_on: string;
  ends_on: string;
  last_allowed_on: string;
  error?: string;
}

// ─── Payments ─────────────────────────────────────────────────────────────────
export interface CreateRazorpayOrderResponse {
  success: boolean;
  data: {
    razorpayOrderId: string;
    finalAmountPaise: number;
    discountPaise: number;
    appliedCouponCode: string | null;
  };
  error?: string;
}

export interface VerifyPaymentPayload {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  orderId: string;
}

export interface VerifyPaymentResponse {
  success: boolean;
  subscription?: {
    id: string;
    category: string;
    status: SubscriptionStatus;
    plan_name: string;
    bowls_total: number;
    starts_on: string;
    ends_on: string;
    last_allowed_on: string;
  };
  error?: string;
}

// ─── Invoices ─────────────────────────────────────────────────────────────────
export interface Invoice {
  id: string;
  invoice_number: string;
  billing_period_start: string | null;
  billing_period_end: string | null;
  total_paise: number;
  subtotal_paise: number;
  discount_paise: number;
  tax_paise: number;
  cgst_paise?: number;
  sgst_paise?: number;
  igst_paise?: number;
  status: string;
  issued_at: string;
  order_id: string | null;
  version?: number;
  revision_of?: string | null;
  superseded_at?: string | null;
  has_pdf?: boolean;
  email_sent_at?: string | null;
  /** Null when the invoice has no plan snapshot. */
  plan_label?: string | null;
}

export interface InvoicesResponse {
  success: boolean;
  data: Invoice[];
}

// Detail view — includes snapshot, line items, related profile, revision linkage
export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price_paise: number;
  amount_paise: number;
  item_type: string;
}

export interface InvoiceBillingSnapshot {
  seller?: {
    legalName?: string;
    addressLines?: string[];
    city?: string;
    state?: string;
    stateCode?: string;
    pincode?: string;
    gstin?: string;
    fssai?: string;
    email?: string;
    phone?: string;
    website?: string;
    logoUrl?: string;
  };
  buyer?: {
    name?: string;
    legalName?: string;
    email?: string;
    phone?: string;
    gstin?: string;
    addressLines?: string[];
    city?: string;
    state?: string;
    pincode?: string;
  };
  plan?: { name?: string; bowlsCount?: number; hsnSac?: string };
}

export interface InvoiceDetail extends Invoice {
  taxable_value_paise: number;
  gst_rate_bps: number;
  place_of_supply: string | null;
  supersede_reason: string | null;
  billing_snapshot: InvoiceBillingSnapshot | null;
  due_date: string | null;
  notes: string | null;
  has_pdf: boolean;
}

export interface InvoiceDetailResponse {
  success: boolean;
  data: {
    invoice: InvoiceDetail;
    lineItems: InvoiceLineItem[];
    profile: { full_name: string | null; phone: string | null; email: string | null } | null;
    orderRef: string | null;
    revisionOf: { id: string; invoice_number: string; issued_at: string } | null;
    supersededBy: { id: string; invoice_number: string; issued_at: string } | null;
  };
}

// ─── Notifications ────────────────────────────────────────────────────────────
export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  data: Record<string, unknown> | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NotificationsResponse {
  success: boolean;
  data: AppNotification[];
  unread_count: number;
}

// ─── Menu ─────────────────────────────────────────────────────────────────────
export interface MenuMeal {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  calories: number | null;
  protein_g: number | null;
  fiber_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  ingredients: string[] | null;
  category: string;
  /** "Vegan", "Jain", "Gluten free" and any other tags, as the website shows them. */
  diet_labels?: string[];
}

export interface MenuCategory {
  slug: string;
  name: string;
  unit_singular: string;
  unit_plural: string;
}

export interface NutritionFlags {
  calories: boolean;
  protein: boolean;
  fiber: boolean;
  carbs: boolean;
  fat: boolean;
}

export interface MenuResponse {
  success: boolean;
  data: {
    meals: MenuMeal[];
    /** In menu order; older servers leave it out. */
    categories?: MenuCategory[];
    showFruits: boolean;
    nutritionFlags: NutritionFlags;
  };
}

// ─── Daily menu ───────────────────────────────────────────────────────────────

export interface DayMenu {
  /** YYYY-MM-DD, IST. */
  date: string;
  /** Monday = 1 … Sunday = 7. */
  weekday: number;
  weekdayName: string;
  salad: string | null;
  soup: string | null;
  juice: string | null;
}

export interface DailyMenuResponse {
  success: boolean;
  data: {
    /** Today's dishes, or Monday's on a Sunday with no salad. */
    next: (DayMenu & { isToday: boolean }) | null;
    /** The next seven days that have dishes. */
    week: DayMenu[];
  };
}

export interface MenuWeek {
  /** Week 1 is the first week with a Monday-to-Saturday date in the month, as on the printed menu. */
  number: number;
  days: DayMenu[];
}

export interface MenuMonth {
  /** YYYY-MM. */
  month: string;
  /** "November". */
  name: string;
  note: string | null;
  weeks: MenuWeek[];
}

export interface MonthlyMenuResponse {
  success: boolean;
  /** The current month, then next month once it is published. */
  data: { months: MenuMonth[] };
}

// ─── Videos ───────────────────────────────────────────────────────────────────
export type VideoCategoryId = 'yoga' | 'fitness' | 'nutrition' | 'wellness';

export interface VideoCategory {
  id: VideoCategoryId;
  label: string;
}

export interface Video {
  id: string;
  title: string;
  description: string | null;
  category: VideoCategoryId;
  source: 'youtube' | 'upload' | 'instagram';
  youtubeId: string | null;
  /** Permalink of an Instagram reel. */
  instagramUrl?: string | null;
  /** Embeddable page for YouTube and Instagram; null for uploads. */
  embedUrl?: string | null;
  /** Root-relative /media path for uploads; null otherwise. */
  videoUrl: string | null;
  orientation?: 'landscape' | 'portrait';
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  isFeatured: boolean;
  publishedAt: string;
}

export interface VideosResponse {
  success: boolean;
  data: {
    categories: VideoCategory[];
    videos: Video[];
  };
}

// ─── Delivery History ─────────────────────────────────────────────────────────
export interface DeliveryHistoryLog {
  id: string;
  delivery_date: string;
  delivery_slot: string;
  status: string;
  delivered_at: string | null;
  quantity: number;
  // Optional only for a history cached before the server sent them.
  category?: string;
  category_name?: string;
  unit?: Units;
  /** The meal on it, when it is one of the subscription menu's. */
  meal_name?: string | null;
  meal_image_url?: string | null;
}

export interface DeliveryHistoryResponse {
  success: boolean;
  data: {
    logs: DeliveryHistoryLog[];
  };
}

// ─── Init (combined screen data) ──────────────────────────────────────────────
export interface InitMeal {
  name: string;
  image_url: string | null;
}

/** The customer's subscriptions as the home and deliveries replies carry them. */
interface SubscriptionsSummary {
  /** The running subscription of the default category, else the first running one. */
  subscription: Subscription | null;
  next_subscription: Subscription | null;
  /** Running and waiting ones, oldest first. */
  subscriptions: Subscription[];
  trial_used: boolean;
  trial_used_by_category: Record<string, boolean>;
  /** Left in the default category only; `left_by_category` counts each in its own unit. */
  bowls_left: number;
  left_by_category: Record<string, CategoryLeft>;
  categories: Categories;
}

export interface DeliveriesInitResponse {
  success: boolean;
  data: SubscriptionsSummary & {
    addresses: DeliveryAddress[];
    schedules: DeliverySchedule[];
    slots: TimeSlot[];
    logs: DeliveryLog[];
    /** Their deliveries are on hold; nothing is booked until we resume them. */
    deliveriesPaused?: boolean;
  };
}

/** What a skip or undo did to one item. */
export interface SkipItemResult {
  id: string;
  category: string;
  slot: string;
  subscription_id: string | null;
  plan_name: string | null;
  changed: boolean;
  moved_to: string | null;
  ends_on: string | null;
  last_allowed_on: string | null;
  code: string | null;
  /** Why this item could not change, as a sentence. */
  error: string | null;
}

export interface DeliveriesActionResponse extends DeliveriesInitResponse {
  homeData: HomeData;
  /** The first item's outcome. */
  result: { moved_to: string | null; ends_on: string | null; last_allowed_on: string | null } | null;
  results: SkipItemResult[];
  /** The sentence to show after a skip, an undo or a change of quantity. */
  message: string | null;
}

export type HomeCriticalLog = DeliveryLog;

export type HomeData = SubscriptionsSummary & {
  schedule: { preferred_days: string[]; delivery_slot: string } | null;
  logs: DeliveryLog[];
};

export interface HomeCriticalResponse {
  success: boolean;
  data: HomeData;
}

export interface HomeStaticResponse {
  success: boolean;
  data: {
    meals: InitMeal[];
    slots: TimeSlot[];
  };
}

export interface AppSettings {
  privacyPolicyUrl:   string | null;
  termsUrl:           string | null;
  refundPolicyUrl:    string | null;
  deliveryPolicyUrl:  string | null;
  appStoreUrl:        string | null;
  playStoreUrl:       string | null;
  supportPhone:       string | null;
  supportWhatsappUrl: string | null;
  supportEmail:       string | null;
  instagramUrl?:      string | null;
  facebookUrl?:       string | null;
  youtubeUrl?:        string | null;
  linkedinUrl?:       string | null;
  swiggyUrl?:         string | null;
  zomatoUrl?:         string | null;
  legalName?:         string;
  gstin?:             string | null;
  fssai?:             string | null;
  showBuiltByCard:    boolean;
  storeReviewMode?:   boolean;
}

export interface AppSettingsResponse {
  success: boolean;
  data: AppSettings;
}

