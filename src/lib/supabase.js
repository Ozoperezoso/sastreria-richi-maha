import { createClient } from '@supabase/supabase-js';

// The publishable key is safe in the browser: row-level security in the database decides access.
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
