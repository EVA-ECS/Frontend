import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://svjwdxhozkulzgxxyzce.supabase.co/';
const supabaseAnonKey = 'sb_publishable_sPTid52Q5HDa4t3od4qb5Q_36YalKIm';

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);