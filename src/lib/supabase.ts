import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Credentials are hardcoded because .env files are excluded from the
// downloadable zip. The anon key is a public key — safe for the browser.
const SUPABASE_URL = 'https://fcdkaxsrbvoqmyncfyli.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_z_pO9XiOblU0uMEtuyLnkQ_zbVENtsr';

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type BetType = 'FC' | 'DD' | 'XD' | 'DD1' | 'WTA' | 'P6';
export type BetStatus = 'PENDING' | 'WON' | 'LOST';
export type RaceStatus = 'open' | 'closed' | 'settled';
export type TxType = 'DEPOSIT' | 'WITHDRAWAL' | 'BET' | 'WIN' | 'ADMIN_ADJUST';
export type TxStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SETTLED';

export interface Profile {
  id: string;
  full_name: string;
  mobile: string;
  role: 'user' | 'admin';
  balance: number;
  avatar_url: string;
  theme: string;
  created_at: string;
  updated_at: string;
}

export interface Race {
  id: string;
  race_number: number;
  status: RaceStatus;
  betting_open: boolean;
  scheduled_at: string | null;
  stream_url: string;
  wta_enabled: boolean;
  p6_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Horse {
  id: string;
  race_id: string;
  horse_number: string;
  horse_name: string;
  jockey: string;
  scratched: boolean;
  created_at: string;
}

export interface Bet {
  id: string;
  user_id: string;
  race_id: string;
  bet_type: BetType;
  selections: any;
  amount: number;
  ticket_code: string;
  status: BetStatus;
  payout_amount: number;
  settled_at: string | null;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  type: TxType;
  amount: number;
  status: TxStatus;
  channel: string;
  reference: string;
  account_details: string;
  screenshot_url: string;
  archived: boolean;
  note: string;
  admin_id: string | null;
  related_bet_id: string | null;
  processed_at: string | null;
  created_at: string;
}

export interface Settings {
  id: number;
  stream_url: string;
  default_race_count: number;
  updated_at: string;
}
