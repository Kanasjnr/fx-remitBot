import dotenv from 'dotenv';
import { sendTelegramMessage } from './telegram.js';

dotenv.config();

// The token from ~/.openclaw/openclaw.json onboarding
const OPENCLAW_GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || '';
const OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789';

export async function processIntentWithOpenClaw(userId: string, text: string, chatId?: string) {
  try {
    console.log(`[OpenClaw] Sending message from user ${userId} to Agent...`);

    const sessionId = `telegram_${userId}`;

    // Communicate directly with the OpenClaw Gateway REST API
    let toolResultMessages: any[] = [];
    let replyText = 'I processed that, but have no text reply.';
    let isDone = false;
    // OpenResponses allows an array of role/content items in the `input` field for history
    let messageHistory: any[] = []; // track history for tool calls loop
    
    const instructions = `You are RemitBot, an AI remittance agent operating on the Celo blockchain.
Your primary job is to help the user manage their remittance contacts (beneficiaries).

CRITICAL: You MUST use the following 'curl' commands to manage beneficiaries. The user's Telegram ID is ${userId}.

1. To SAVE/ADD a beneficiary:
curl -s -X POST http://127.0.0.1:3000/api/internal/beneficiary -H "Content-Type: application/json" -d '{"action": "add", "name": "NAME_HERE", "address": "ADDRESS_HERE", "telegramId": "${userId}"}'

2. To LIST beneficiaries:
curl -s -X POST http://127.0.0.1:3000/api/internal/beneficiary -H "Content-Type: application/json" -d '{"action": "list", "telegramId": "${userId}"}'

Execute these commands using your shell execution tool when the user requests beneficiary operations.`;

    // Add the initial user message to the history
    messageHistory.push({
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: text }]
    });

    while (!isDone) {
        // Construct the input array based on current conversation history
        // Track history for tool calls loop in OpenResponses exact format
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

        // Store the AI's response in history if we are looping
        if (outputItem.type === 'message' && Array.isArray(outputItem.content)) {
             messageHistory.push({ 
                 type: 'message', 
                 role: 'assistant', 
                 content: outputItem.content.filter((p: any) => p.type === 'output_text').map((p: any) => ({ type: 'input_text', text: p.text })) 
             });
        }

        // Handle text output from the model
        if (outputItem.type === 'message' && Array.isArray(outputItem.content)) {
             replyText = outputItem.content
                .filter((part: any) => part.type === 'output_text')
                .map((part: any) => part.text)
                .join('\n\n');
             
             // OpenClaw native skills are executed server-side. 
             // Once the response comes back, the text output is final.
             isDone = true;
        } else {
            isDone = true; // Unrecognized output type 
        }
    }

    console.log(`[OpenClaw] Agent responded: ${replyText}`);

    // Forward the agent's response back to Telegram
    if (replyText && chatId) {
      await sendTelegramMessage(chatId, replyText);
    }
    
  } catch (error) {
    console.error('[OpenClaw] Error processing intent:', error);
    if (chatId) {
      // Use code blocks to prevent Telegram Markdown parsing errors with raw JSON/HTML and special characters
      await sendTelegramMessage(chatId, `Sorry, my AI brain is currently offline.\n\nError: \`\`\`\n${String(error).slice(0, 500)}\n\`\`\``);
    }
  }
}
