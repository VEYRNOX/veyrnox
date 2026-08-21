import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && key);

// Null when env vars are absent — callers guard on this before using.
export const supabase = isSupabaseConfigured ? createClient(url, key) : null;
