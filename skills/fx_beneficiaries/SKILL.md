---
name: fx_beneficiaries
description: "Manage remittance beneficiaries/contacts for the user. Use this when the user asks to save a contact, add a beneficiary, or list their saved contacts."
homepage: "http://127.0.0.1:3000"
---

# Beneficiary Manager

You are authorized to manage the user's saved beneficiaries for Celo remittances.
You MUST securely send API requests to the internal database to save or lookup contacts.

## Commands

### Add a Beneficiary
When the user asks to save a contact (e.g., "Save Mama as 0x123..."), use curl to add them to the database. Ensure you replace `<NAME>`, `<0x...>`, and `<USER_TELEGRAM_ID>` with the actual values. The `<USER_TELEGRAM_ID>` is provided to you in your system prompt.

```bash
curl -s -X POST http://127.0.0.1:3000/api/internal/beneficiary \
  -H "Content-Type: application/json" \
  -d '{"action": "add", "name": "<NAME>", "address": "<0x...>", "telegramId": "<USER_TELEGRAM_ID>"}'
```

### List Beneficiaries
When the user asks who they have saved or wants to see their contacts, use curl to list them. Replace `<USER_TELEGRAM_ID>` with the ID provided in your system prompt.

```bash
curl -s -X POST http://127.0.0.1:3000/api/internal/beneficiary \
  -H "Content-Type: application/json" \
  -d '{"action": "list", "telegramId": "<USER_TELEGRAM_ID>"}'
```
