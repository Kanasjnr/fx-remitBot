import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase credentials missing. Database features will not work.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
export type { Database } from './types.js'; // We'll generate this later
