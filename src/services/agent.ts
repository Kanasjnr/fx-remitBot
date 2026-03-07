import dotenv from 'dotenv';
import { sendTelegramMessage } from './telegram.js';

dotenv.config();

// The token from ~/.openclaw/openclaw.json onboarding
const OPENCLAW_GATEWAY_TOKEN = '3de73d051bc8b4d3b17e4b98027cefb036bbed0c87d80b31';
const OPENCLAW_GATEWAY_URL = 'http://127.0.0.1:18789';

export async function processIntentWithOpenClaw(userId: string, text: string, chatId?: string) {
  try {
    console.log(`[OpenClaw] Sending message from user ${userId} to Agent...`);

    const sessionId = `telegram_${userId}`;

    // Communicate directly with the OpenClaw Gateway REST API
    const response = await fetch(`${OPENCLAW_GATEWAY_URL}/v1/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENCLAW_GATEWAY_TOKEN}`
      },
      body: JSON.stringify({
        model: 'openclaw:main',
        input: text,
        user: sessionId,
      })
    });

    if (!response.ok) {
      throw new Error(`OpenClaw API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    let replyText = 'I processed that, but have no text reply.';
    const outputItem = data?.output?.[0];
    if (outputItem?.type === 'message' && Array.isArray(outputItem.content)) {
      replyText = outputItem.content
        .filter((part: any) => part.type === 'output_text')
        .map((part: any) => part.text)
        .join('\n\n');
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
