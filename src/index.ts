import express from 'express';
import type TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { setTelegramWebhook, parseTelegramUpdate } from './services/telegram.js';
import { routeMessage } from './services/router.js';
import { executeBeneficiaryTool } from './services/tools/beneficiaries.js';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Internal OpenClaw Skill Execution Route
app.post('/api/internal/beneficiary', async (req, res) => {
  try {
    const { action, name, address, telegramId } = req.body;
    
    if (!telegramId) {
      return res.status(400).json({ error: 'Missing telegramId' });
    }

    let toolName = '';
    let args: any = {};
    
    if (action === 'add') {
      toolName = 'add_beneficiary';
      args = { name, address };
    } else if (action === 'list') {
      toolName = 'list_beneficiaries';
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const resultString = await executeBeneficiaryTool(toolName, args, telegramId);
    res.status(200).json(JSON.parse(resultString));
  } catch (err: any) {
    console.error('Internal API error:', err);
    res.status(500).json({ error: err.message });
  }
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

  const backendUrl = process.env.BACKEND_URL;
  if (backendUrl) {
    await setTelegramWebhook(backendUrl);
  } else {
    console.log(' BACKEND_URL not set. Set it with ngrok URL to register Telegram webhook.');
  }
});

export default app;
