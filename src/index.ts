import express from 'express';
import type TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { setTelegramWebhook, parseTelegramUpdate } from './services/telegram.js';
import { routeMessage } from './services/router.js';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Telegram Webhook
app.post('/webhooks/telegram', async (req, res) => {
  try {
    const update = req.body as TelegramBot.Update;
    const { chatId, text, userId } = parseTelegramUpdate(update);

    if (chatId && text && userId) {
      await routeMessage({
        platform: 'telegram',
        senderId: userId.toString(),
        chatId: chatId.toString(),
        text,
        raw: update,
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Telegram webhook error:', err);
    res.sendStatus(200); // Always 200 to Telegram to avoid retry loops
  }
});

// Start server
app.listen(PORT, async () => {
  console.log(` FX RemitBot server running on port ${PORT}`);

  // Register webhook if BACKEND_URL is set
  const backendUrl = process.env.BACKEND_URL;
  if (backendUrl) {
    await setTelegramWebhook(backendUrl);
  } else {
    console.log(' BACKEND_URL not set. Set it with ngrok URL to register Telegram webhook.');
  }
});

export default app;
