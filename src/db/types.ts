export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          telegram_id: number | null;
          whatsapp_phone: string | null;
          wallet_address: string | null;
          wc_session_id: string | null;
          created_at: string;
          last_active_at: string;
        };
        Insert: {
          id?: string;
          telegram_id?: number | null;
          whatsapp_phone?: string | null;
          wallet_address?: string | null;
          wc_session_id?: string | null;
          created_at?: string;
          last_active_at?: string;
        };
        Update: {
          id?: string;
          telegram_id?: number | null;
          whatsapp_phone?: string | null;
          wallet_address?: string | null;
          wc_session_id?: string | null;
          created_at?: string;
          last_active_at?: string;
        };
      };
      beneficiaries: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          address: string;
          country: string | null;
          preferred_currency: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          address: string;
          country?: string | null;
          preferred_currency?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          address?: string;
          country?: string | null;
          preferred_currency?: string | null;
          created_at?: string;
        };
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          beneficiary_id: string | null;
          from_address: string;
          to_address: string;
          amount: number;
          currency: string;
          tx_hash: string | null;
          status: string;
          gas_fee: number | null;
          network_fee: number | null;
          total_cost: number | null;
          executed_at: string;
          confirmations: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          beneficiary_id?: string | null;
          from_address: string;
          to_address: string;
          amount: number;
          currency: string;
          tx_hash?: string | null;
          status?: string;
          gas_fee?: number | null;
          network_fee?: number | null;
          total_cost?: number | null;
          executed_at?: string;
          confirmations?: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          beneficiary_id?: string | null;
          from_address?: string;
          to_address?: string;
          amount?: number;
          currency?: string;
          tx_hash?: string | null;
          status?: string;
          gas_fee?: number | null;
          network_fee?: number | null;
          total_cost?: number | null;
          executed_at?: string;
          confirmations?: number;
        };
      };
      recurring_transfers: {
        Row: {
          id: string;
          user_id: string;
          beneficiary_id: string | null;
          amount: number;
          currency: string;
          frequency_seconds: number;
          total_transfers: number;
          remaining_transfers: number;
          next_execution_time: string;
          status: string;
          contract_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          beneficiary_id?: string | null;
          amount: number;
          currency: string;
          frequency_seconds: number;
          total_transfers: number;
          remaining_transfers: number;
          next_execution_time: string;
          status?: string;
          contract_address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          beneficiary_id?: string | null;
          amount?: number;
          currency?: string;
          frequency_seconds?: number;
          total_transfers?: number;
          remaining_transfers?: number;
          next_execution_time?: string;
          status?: string;
          contract_address?: string | null;
          created_at?: string;
        };
      };
    };
  };
}
