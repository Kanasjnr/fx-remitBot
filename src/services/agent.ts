import dotenv from 'dotenv';
import { sendTelegramMessage } from './telegram.js';
import { getUserByTelegramId } from '../db/index.js';

dotenv.config();

// The token from ~/.openclaw/openclaw.json onboarding
const OPENCLAW_GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || '';
const OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789';

export async function processIntentWithOpenClaw(userId: string, text: string, chatId?: string) {
  try {
    console.log(`[OpenClaw] Sending message from user ${userId} to Agent...`);

    const sessionId = `telegram_${userId}`;
    const user = await getUserByTelegramId(parseInt(userId));
    const walletAddress = user?.wallet_address || 'NOT_SET';

    // Communicate directly with the OpenClaw Gateway REST API
    let toolResultMessages: any[] = [];
    let replyText = 'I processed that, but have no text reply.';
    let isDone = false;
    // OpenResponses allows an array of role/content items in the `input` field for history
    let messageHistory: any[] = []; // track history for tool calls loop
    
    const instructions = `You are RemitBot, an AI remittance agent operating on the Celo blockchain.
Your primary job is to help the user manage their remittance contacts (beneficiaries) and their Celo assets.

The user's Telegram ID is ${userId}.
The user's registered wallet address is: ${walletAddress}.

CRITICAL: You MUST use the following 'curl' commands for operations.

1. To SAVE/ADD a beneficiary:
curl -s -X POST http://127.0.0.1:3000/api/internal/beneficiary -H "Content-Type: application/json" -d '{"action": "add", "name": "NAME_HERE", "address": "ADDRESS_HERE", "telegramId": "${userId}"}'

2. To LIST beneficiaries:
curl -s -X POST http://127.0.0.1:3000/api/internal/beneficiary -H "Content-Type: application/json" -d '{"action": "list", "telegramId": "${userId}"}'

3. To CHECK BALANCES:
curl -s -X POST http://127.0.0.1:3000/api/internal/blockchain -H "Content-Type: application/json" -d '{"action": "balance", "address": "${walletAddress === 'NOT_SET' ? '0xUSER_ADDRESS_HERE' : walletAddress}"}'

Note: If the wallet address is NOT_SET, ask the user to provide their Celo wallet address.
4. To CHECK EXCHANGE RATES (Mento):
curl -s -X POST http://127.0.0.1:3000/api/internal/mento -H "Content-Type: application/json" -d '{"action": "rate", "tokenIn": "CELO", "tokenOut": "cUSD", "amountIn": "10"}'

Note: Supported tokens include CELO, cUSD, cEUR, cREAL, USDC, USDT.

5. To SEND CRYPTO (Transfer):
curl -s -X POST http://127.0.0.1:3000/api/internal/transfer -H "Content-Type: application/json" -d '{"to": "0xRECIPIENT", "amount": "1.5", "tokenSymbol": "cUSD", "telegramId": "${userId}"}'

### TRANSACTION PROTOCOL (AUTONOMOUS AGENT):
1. You are a fully autonomous AI financial agent.
2. The user has deposited funds into an agent-controlled wallet linked to their account.
3. When the user says "Send $50 to Mama", you MUST immediately find Mama's address in the beneficiaries list.
4. If the address is found, you MUST immediately call the SEND CRYPTO (curl #5) command.
5. You DO NOT ask the user to sign anything or click any links. You simply execute the transfer and reply with the success message and transaction hash.

Execute these commands using your shell execution tool when the user requests beneficiary operations, balance checks, currency conversions, sending money, or swapping tokens.`;

    // Add the initial user message to the history
    messageHistory.push({
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: text }]
    });

    while (!isDone) {
        const inputData = messageHistory;

        const payload = {
            model: 'openclaw:main',
            input: inputData, 
            instructions: instructions,
            user: sessionId
        };

        const response = await fetch(`${OPENCLAW_GATEWAY_URL}/v1/responses`, {
            method: 'POST',
            headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENCLAW_GATEWAY_TOKEN}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`OpenClaw API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const outputItem = data?.output?.[0];
        
        if (!outputItem) {
            isDone = true;
            break;
        }

        if (outputItem.type === 'message' && Array.isArray(outputItem.content)) {
             messageHistory.push({ 
                 type: 'message', 
                 role: 'assistant', 
                 content: outputItem.content.filter((p: any) => p.type === 'output_text').map((p: any) => ({ type: 'input_text', text: p.text })) 
             });
        }

        if (outputItem.type === 'message' && Array.isArray(outputItem.content)) {
             replyText = outputItem.content
                .filter((part: any) => part.type === 'output_text')
                .map((part: any) => part.text)
                .join('\n\n');
             
             isDone = true;
        } else {
            isDone = true; 
        }
    }

    console.log(`[OpenClaw] Agent responded: ${replyText}`);

    if (replyText && chatId) {
      await sendTelegramMessage(chatId, replyText);
    }
    
  } catch (error) {
    console.error('[OpenClaw] Error processing intent:', error);
    if (chatId) {
      await sendTelegramMessage(chatId, `Sorry, my AI brain is currently offline.\n\nError: ${String(error).slice(0, 500)}`);
    }
  }
}
