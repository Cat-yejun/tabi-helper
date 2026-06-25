export type ExpenseItem = { name: string; price: number; qty?: number };

export type Expense = {
  id: string;
  created_at?: string;
  store: string | null;
  purchase_date: string | null;
  purchase_time: string | null; // "HH:MM"
  total: number | null;
  currency: string;
  category: string | null;
  items: ExpenseItem[];
  note: string | null;
  image_url: string | null;
  itinerary_id?: string | null;
};

export type Profile = { id: string; username: string };
export type TripMember = { itinerary_id: string; user_id: string; role: "owner" | "member"; username?: string };

export type ShoppingItem = {
  id: string;
  created_at?: string;
  name: string;
  note: string | null;
  checked: boolean;
  sort_order: number;
};

export type Itinerary = {
  id: string;
  created_at?: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  share_code?: string | null;
};

export type ItineraryItem = {
  id: string;
  itinerary_id: string;
  day_date: string | null;
  time: string | null;
  place: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  category: string | null;
  note: string | null;
  sort_order: number;
};

export type ChatMessage = {
  id?: string;
  created_at?: string;
  conversation_id?: string;
  role: "user" | "assistant";
  content: string;
  image?: string | null;
};

export type Conversation = {
  id: string;
  created_at?: string;
  updated_at?: string;
  title: string;
};

export type Translation = {
  id: string;
  created_at?: string;
  original: string | null;
  translation: string | null;
  explanation: string | null;
  image_url: string | null;
  replaced_url: string | null;
  source: "photo" | "live" | "voice" | null;
};

export const CATEGORIES = ["식비", "교통", "쇼핑", "관광", "숙박", "기타"] as const;
export const PLAN_CATEGORIES = ["관광", "식사", "이동", "숙박", "쇼핑", "기타"] as const;

export const EXPENSE_SORTS = [
  { key: "date_desc", label: "날짜 최신순" },
  { key: "date_asc", label: "날짜 오래된순" },
  { key: "category", label: "종류별" },
  { key: "amount_desc", label: "금액 높은순" },
] as const;
export type ExpenseSortKey = typeof EXPENSE_SORTS[number]["key"];
