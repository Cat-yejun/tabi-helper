export type ExpenseItem = { name: string; price: number; qty?: number };

export type Expense = {
  id: string;
  created_at?: string;
  store: string | null;
  purchase_date: string | null;
  total: number | null;
  currency: string;
  category: string | null;
  items: ExpenseItem[];
  note: string | null;
  image_url: string | null;
};

export type Itinerary = {
  id: string;
  created_at?: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
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
  role: "user" | "assistant";
  content: string;
};

export type Translation = {
  id: string;
  created_at?: string;
  original: string | null;
  translation: string | null;
  explanation: string | null;
  image_url: string | null;
};

export const CATEGORIES = ["식비", "교통", "쇼핑", "관광", "숙박", "기타"] as const;
export const PLAN_CATEGORIES = ["관광", "식사", "이동", "숙박", "쇼핑", "기타"] as const;
