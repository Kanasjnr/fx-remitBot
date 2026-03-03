# Remittance Bot

A professional remittance agent for WhatsApp and Telegram, built on Celo.

## Features
- AI-powered natural language intent parsing.
- Multi-currency support via Celo stablecoins.
- Secure transactions via WalletConnect.
- Recurring transfer scheduling.
- ERC-8004 Agent Trust Protocol integration.
- x402 HTTP-native payments.

## Structure
- `src/services`: External integrations (Telegram, WhatsApp, Celo).
- `src/db`: Database schema and client.
- `src/types`: TypeScript definitions.
- `src/utils`: Shared helper functions.
- `src/middleware`: Express middleware (e.g., x402).
- `src/index.ts`: Application entry point.

## Setup
1. `npm install`
2. Configure `.env` based on `.env.example`.
3. `npm run dev`
