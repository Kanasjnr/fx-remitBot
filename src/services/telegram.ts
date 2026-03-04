import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN || '';

export const bot = token ? new TelegramBot(token, { polling: false }) : null;

export async function sendMessage(chatId: number | string, text: string) {
    if (!bot) {
        console.warn('Telegram bot not initialized.');
        return;
    }
    await bot.sendMessage(chatId, text);
}
