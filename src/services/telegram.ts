import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN || '';

if (!token) {
  console.warn('TELEGRAM_BOT_TOKEN is missing. Telegram bot will not work.');
}

export const bot = token ? new TelegramBot(token) : null;

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  options?: TelegramBot.SendMessageOptions
): Promise<void> {
  if (!bot) {
    console.warn('Telegram bot not initialized.');
    return;
  }
  await bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    ...options,
  });
}

export async function setTelegramWebhook(webhookUrl: string): Promise<void> {
  if (!bot) return;
  await bot.setWebHook(`${webhookUrl}/webhooks/telegram`);
  console.log(`Telegram webhook set to: ${webhookUrl}/webhooks/telegram`);
}

export function parseTelegramUpdate(body: TelegramBot.Update): {
  chatId: number | null;
  text: string | null;
  userId: number | null;
  username: string | null;
} {
  const message = body.message;
  if (!message) return { chatId: null, text: null, userId: null, username: null };

  return {
    chatId: message.chat.id,
    text: message.text ?? null,
    userId: message.from?.id ?? null,
    username: message.from?.username ?? null,
  };
}
