import { sendTelegramMessage } from './telegram.js';
import { getUserByTelegramId, upsertUser } from '../db/index.js';

export type MessagePlatform = 'telegram' | 'whatsapp';

export interface IncomingMessage {
  platform: MessagePlatform;
  senderId: string;
  text: string;
  chatId?: string; // Telegram-specific
  raw: unknown;
}

async function reply(message: IncomingMessage, text: string): Promise<void> {
  if (message.platform === 'telegram' && message.chatId) {
    await sendTelegramMessage(message.chatId, text);
  }
  // WhatsApp reply will be added here later
}

export async function routeMessage(message: IncomingMessage): Promise<void> {
  const { platform, senderId, text } = message;
  console.log(`[${platform.toUpperCase()}] Message from ${senderId}: ${text}`);

  // 1. Upsert user into database
  if (platform === 'telegram') {
    await upsertUser({ telegram_id: parseInt(senderId) });
  }

  // 2. Handle basic commands
  const lowerText = text.toLowerCase().trim();

  if (lowerText === '/start' || lowerText === 'hi' || lowerText === 'hello') {
    await reply(
      message,
      ` *Welcome to FX RemitBot!*\n\nI can help you:\n• 💸 Send money: _"Send $50 to Mama"_\n• 📋 Save contacts: _"Save Mama 0x1234..."_\n• 💰 Check balance: _"What's my balance?"_\n• 📅 Schedule: _"Send $100 to Papa every month"_\n\nWhat would you like to do?`
    );
    return;
  }

  if (lowerText === '/help') {
    await reply(
      message,
      ` *FX RemitBot Commands*\n\n• /start — Welcome message\n• /balance — Check your wallet balance\n• /history — View recent transactions\n• /beneficiaries — List saved contacts\n\nOr just type naturally, like:\n_"Send 50 USDC to Mama"_`
    );
    return;
  }

  if (lowerText === '/balance') {
    await reply(message, ` Fetching your balance...\n\n_(Blockchain integration coming soon!)_`);
    return;
  }

  // Default response for unrecognised messages
  await reply(
    message,
    `I didn't quite get that. Try saying something like:\n• _"Send $50 to Mama"_\n• _"Check my balance"_\n\nOr type /help for a full list of commands.`
  );
}
