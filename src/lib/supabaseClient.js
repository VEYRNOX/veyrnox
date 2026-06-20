import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Null when env vars are absent — callers guard on this before using.
export const supabase = url && key ? createClient(url, key) : null;
