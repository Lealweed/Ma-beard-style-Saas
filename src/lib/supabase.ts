import { createClient } from '@supabase/supabase-js';

declare global {
  interface Window {
    __APP_CONFIG__?: {
      supabaseUrl?: string;
      supabaseAnonKey?: string;
    };
  }
}

const runtimeConfig = typeof window !== 'undefined' ? window.__APP_CONFIG__ : undefined;

const supabaseUrl = runtimeConfig?.supabaseUrl || import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = runtimeConfig?.supabaseAnonKey || import.meta.env.VITE_SUPABASE_ANON_KEY;

// Diagnostic logging (visible in browser console)
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase: chaves de configuração não encontradas no runtime nem no build (SUPABASE_URL/VITE_SUPABASE_URL e SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY).');
} else {
  console.log('Supabase: chaves detectadas. Inicializando cliente.');
}

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseUrl.startsWith('http') && supabaseAnonKey);

export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : (null as any);

export const testSupabaseConnection = async () => {
  if (!isSupabaseConfigured) return { success: false, message: 'Supabase não configurado.' };
  try {
    // A simple call to check if the API key and URL are valid
    const { error } = await supabase.auth.getSession();
    if (error) throw error;
    return { success: true, message: 'Conexão com a API do Supabase estabelecida com sucesso!' };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
};

export const getSupabaseDiagnostics = () => ({
  urlSet: Boolean(supabaseUrl),
  urlValid: Boolean(supabaseUrl?.startsWith('http')),
  keySet: Boolean(supabaseAnonKey),
  urlValue: supabaseUrl ? `${supabaseUrl.substring(0, 15)}...` : 'ausente',
  keyValue: supabaseAnonKey ? `${supabaseAnonKey.substring(0, 10)}...` : 'ausente',
});
