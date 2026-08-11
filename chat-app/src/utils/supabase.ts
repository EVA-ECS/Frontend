// utils/supabase.ts
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = 'https://svjwdxhozkulzgxxyzce.supabase.co';
const supabaseAnonKey = 'sb_publishable_sPTid52Q5HDa4t3od4qb5Q_36YalKIm';


const customStorage = Platform.OS === 'web'
    ? {
        getItem: (key: string) => {
            if (typeof window === 'undefined') return null;
            return window.localStorage.getItem(key);
        },
        setItem: (key: string, value: string) => {
            if (typeof window === 'undefined') return;
            window.localStorage.setItem(key, value);
        },
        removeItem: (key: string) => {
            if (typeof window === 'undefined') return;
            window.localStorage.removeItem(key);
        },
    }
    : AsyncStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: customStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});