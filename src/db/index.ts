import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import type { Database } from './types.js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase credentials missing. Database features will not work.');
}

export const supabase = createClient<any>(supabaseUrl, supabaseKey);

// --- User Helpers ---

export async function getUserByTelegramId(telegramId: number) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "no rows returned"
  return data;
}

export async function getUserByWhatsAppPhone(phone: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('whatsapp_phone', phone)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function upsertUser(user: Database['public']['Tables']['users']['Insert']) {
  const { data, error } = await supabase
    .from('users')
    .upsert(user, { onConflict: 'telegram_id' }) // Defaulting to telegram_id conflict for now
    .select()
    .single();

  if (error) throw error;
  return data;
}

// --- Beneficiary Helpers ---

export async function getBeneficiaries(userId: string) {
  const { data, error } = await supabase
    .from('beneficiaries')
    .select('*')
    .eq('user_id', userId);

  if (error) throw error;
  return data;
}

export async function createBeneficiary(beneficiary: Database['public']['Tables']['beneficiaries']['Insert']) {
  const { data, error } = await supabase
    .from('beneficiaries')
    .insert(beneficiary)
    .select()
    .single();

  if (error) throw error;
  return data;
}
