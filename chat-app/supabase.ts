import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';



const supabaseUrl = 'https://svjwdxhozkulzgxxyzce.supabase.co';
const supabaseAnonKey = 'sb_publishable_sPTid52Q5HDa4t3od4qb5Q_36YalKIm';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});