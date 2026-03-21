import { sendTelegramMessage } from "./telegram.js";
import { getUserByTelegramId, upsertUser } from "../db/index.js";
import { processIntentWithOpenClaw } from "./agent.js";

export type MessagePlatform = "telegram" | "whatsapp";

export interface IncomingMessage {
  platform: MessagePlatform;
  senderId: string;
  text: string;
  chatId?: string; // Telegram-specific
  raw: unknown;
}

async function reply(
  message: IncomingMessage,
  text: string,
  options?: any,
): Promise<void> {
  if (message.platform === "telegram" && message.chatId) {
    await sendTelegramMessage(message.chatId, text, options);
  }
}

export async function routeMessage(message: IncomingMessage): Promise<void> {
  const { platform, senderId, text } = message;
  console.log(`[${platform.toUpperCase()}] Message from ${senderId}: ${text}`);

  // 1. Upsert user into database
  if (platform === "telegram") {
    await upsertUser({ telegram_id: parseInt(senderId) });
  }

  // 2. Handle basic commands
  const lowerText = text.toLowerCase().trim();

  // Basic "hi" or "/start" handler
  if (lowerText === "/start" || lowerText === "hi" || lowerText === "hello") {
    await reply(
      message,
      ` *Welcome to FX RemitBot!*

Your AI-powered assistant for lightning-fast, high-trust remittances on Celo.

What would you like to do today?`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Send Money", callback_data: "menu_send" },
              { text: "Balance", callback_data: "menu_balance" },
            ],
            [
              { text: "Contacts", callback_data: "menu_contacts" },
              { text: "Reset", callback_data: "menu_reset" },
            ],
          ],
        },
      },
    );
    return;
  }

  if (lowerText === "/reset") {
    await reply(
      message,
      `*Confirm Reset*
Are you sure you want to clear your conversation history? This will help if the AI is confused, but it will forget our current chat.`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Yes, Reset", callback_data: "reset_confirm" },
              { text: "❌ No", callback_data: "tx_can" },
            ],
          ],
        },
      },
    );
    return;
  }

  if (lowerText === "/balance") {
    const { processIntentWithOpenClaw } = await import("./agent.js");
    await processIntentWithOpenClaw(
      senderId,
      "check my balance",
      message.chatId,
    );
    return;
  }

  if (lowerText === "/contacts" || lowerText === "/beneficiaries") {
    const { processIntentWithOpenClaw } = await import("./agent.js");
    await processIntentWithOpenClaw(
      senderId,
      "list my beneficiaries",
      message.chatId,
    );
    return;
  }

  if (lowerText === "/help") {
    await reply(
      message,
      ` *RemitBot Help*

You can talk to me in natural language, or use these commands:
• /start - Main dashboard
• /balance - Check your wallet
• /contacts - Manage recipients
• /reset - Start a fresh session

*Transfer Examples:*
- "send 10 cUSD to Mama"
- "remit $50 to Kenya"
- "schedule 5 cNGN daily to Papa"`,
    );
    return;
  }

  // 3. For all other natural language messages, let OpenClaw parse the intent!
  if (message.platform === "telegram" && message.chatId) {
    await processIntentWithOpenClaw(senderId, text, message.chatId);
  }
}
