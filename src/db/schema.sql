-- Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id BIGINT UNIQUE,
    whatsapp_phone TEXT UNIQUE,
    wallet_address TEXT UNIQUE,
    wc_session_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Beneficiaries Table
CREATE TABLE beneficiaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    country TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name)
);

-- Transactions Table
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    beneficiary_id UUID REFERENCES beneficiaries(id),
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    currency TEXT NOT NULL, -- e.g., 'USDm', 'EURm'
    tx_hash TEXT UNIQUE,
    status TEXT DEFAULT 'pending', -- 'pending', 'confirmed', 'failed'
    gas_fee NUMERIC,
    network_fee NUMERIC,
    total_cost NUMERIC,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    confirmations INTEGER DEFAULT 0
);

-- Recurring Transfers Table
CREATE TABLE recurring_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    beneficiary_id UUID REFERENCES beneficiaries(id),
    amount NUMERIC NOT NULL,
    currency TEXT NOT NULL,
    frequency_seconds BIGINT NOT NULL, -- e.g., 2592000 for 30 days
    total_transfers INTEGER NOT NULL,
    remaining_transfers INTEGER NOT NULL,
    next_execution_time TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'
    contract_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
