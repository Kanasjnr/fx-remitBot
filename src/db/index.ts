import "../services/utils.js";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import type { Database } from "./types.js";
import { withRetry } from "../services/utils.js";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_KEY || "";

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    "Supabase credentials missing. Database features will not work.",
  );
}

export const supabase = createClient<any>(supabaseUrl, supabaseKey);

/**
 * Senior-level data sanitization helper.
 * Recursively converts BigInts to serializable numbers or strings.
 * This prevents the "Do not know how to serialize a BigInt" error
 * that occurs in JSON.stringify (used by Express and Supabase).
 */
function sanitize(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === "bigint") {
    const num = Number(obj);
    return Number.isSafeInteger(num) ? num : obj.toString();
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitize(item));
  }

  if (typeof obj === "object" && obj.constructor === Object) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitize(value);
    }
    return sanitized;
  }

  return obj;
}

// --- User Helpers ---

export async function getUserByTelegramId(telegramId: number) {
  return withRetry(
    async () => {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("telegram_id", telegramId)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      return sanitize(data);
    },
    3,
    1000,
    "getUserByTelegramId",
  );
}

export async function getUserByWhatsAppPhone(phone: string) {
  return withRetry(
    async () => {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("whatsapp_phone", phone)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      return sanitize(data);
    },
    3,
    1000,
    "getUserByWhatsAppPhone",
  );
}

export async function upsertUser(
  user: Database["public"]["Tables"]["users"]["Insert"],
) {
  return withRetry(
    async () => {
      const { data, error } = await supabase
        .from("users")
        .upsert(sanitize(user), { onConflict: "telegram_id" })
        .select()
        .single();

      if (error) throw error;
      return sanitize(data);
    },
    2,
    1000,
    "upsertUser",
  );
}

// --- Beneficiary Helpers ---

export async function getBeneficiaries(userId: string) {
  return withRetry(
    async () => {
      const { data, error } = await supabase
        .from("beneficiaries")
        .select("*")
        .eq("user_id", userId);

      if (error) throw error;
      return sanitize(data);
    },
    3,
    1000,
    "getBeneficiaries",
  );
}

export async function findBeneficiary(userId: string, identifier: string) {
  return withRetry(
    async () => {
      // Try lookup by address first
      const { data: byAddr, error: err1 } = await supabase
        .from("beneficiaries")
        .select("*")
        .eq("user_id", userId)
        .eq("address", identifier)
        .maybeSingle();

      if (byAddr) return sanitize(byAddr);

      // Try lookup by name
      const { data: byName } = await supabase
        .from("beneficiaries")
        .select("*")
        .eq("user_id", userId)
        .ilike("name", identifier)
        .maybeSingle();

      return sanitize(byName);
    },
    2,
    1000,
    "findBeneficiary",
  );
}

export async function createBeneficiary(
  beneficiary: Database["public"]["Tables"]["beneficiaries"]["Insert"],
) {
  return withRetry(
    async () => {
      const { data, error } = await supabase
        .from("beneficiaries")
        .insert(sanitize(beneficiary))
        .select()
        .single();

      if (error) throw error;
      return sanitize(data);
    },
    2,
    1000,
    "createBeneficiary",
  );
}

export async function deleteBeneficiary(userId: string, identifier: string) {
  return withRetry(
    async () => {
      // Find the beneficiary first to get the correct ID
      const target = await findBeneficiary(userId, identifier);
      if (!target) {
        return { success: false, error: `Beneficiary '${identifier}' not found.` };
      }

      // 1. Delete linked recurring transfers (Mandatory for demo functionality)
      await supabase
        .from("recurring_transfers")
        .delete()
        .eq("beneficiary_id", target.id);

      // 2. Set beneficiary_id to NULL in transactions (Preserve history but break link)
      await supabase
        .from("transactions")
        .update({ beneficiary_id: null })
        .eq("beneficiary_id", target.id);

      // 3. Delete the beneficiary
      const { error } = await supabase
        .from("beneficiaries")
        .delete()
        .eq("id", target.id)
        .eq("user_id", userId);

      if (error) throw error;
      return { success: true, message: `Beneficiary '${target.name}' and its linked schedules have been deleted.` };
    },
    2,
    1000,
    "deleteBeneficiary",
  );
}

// --- Transaction Helpers ---

export async function logTransaction(
  transaction: Database["public"]["Tables"]["transactions"]["Insert"],
) {
  return withRetry(
    async () => {
      const { data, error } = await supabase
        .from("transactions")
        .insert(sanitize(transaction))
        .select()
        .single();

      if (error) throw error;
      return sanitize(data);
    },
    5,
    500,
    "logTransaction",
  ); // Higher retries for logs
}

// --- Recurring Transfer Helpers ---

export async function getRecurringTransfers(userId: string) {
  return withRetry(
    async () => {
      const { data, error } = await supabase
        .from("recurring_transfers")
        .select("*, beneficiaries(name, address)")
        .eq("user_id", userId);

      if (error) throw error;
      return sanitize(data);
    },
    3,
    1000,
    "getRecurringTransfers",
  );
}

export async function createRecurringTransfer(
  transfer: Database["public"]["Tables"]["recurring_transfers"]["Insert"],
) {
  return withRetry(
    async () => {
      const { data, error } = await supabase
        .from("recurring_transfers")
        .insert(sanitize(transfer))
        .select()
        .single();

      if (error) throw error;
      return sanitize(data);
    },
    2,
    1000,
    "createRecurringTransfer",
  );
}

export async function updateRecurringTransfer(
  id: string,
  updates: Database["public"]["Tables"]["recurring_transfers"]["Update"],
) {
  return withRetry(
    async () => {
      const { data, error } = await supabase
        .from("recurring_transfers")
        .update(sanitize(updates))
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return sanitize(data);
    },
    3,
    1000,
    "updateRecurringTransfer",
  );
}

export async function getPendingRecurringTransfers() {
  return withRetry(
    async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("recurring_transfers")
        .select("*, users(telegram_id), beneficiaries(name, address)")
        .eq("status", "ACTIVE")
        .lte("next_execution_time", now)
        .gt("remaining_transfers", 0);

      if (error) throw error;
      return sanitize(data);
    },
    4,
    1000,
    "getPendingRecurringTransfers",
  ); // Important for cron
}
