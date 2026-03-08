import express from 'express';
import type TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { setTelegramWebhook, parseTelegramUpdate } from './services/telegram.js';
import { routeMessage } from './services/router.js';
import { executeBeneficiaryTool } from './services/tools/beneficiaries.js';
import { getAllBalances, getBalance, getAllowance } from './services/blockchain.js';
import { getUserByTelegramId, upsertUser, logTransaction } from './db/index.js';
import { getExchangeRate } from './services/mento.js';
import { sendStablecoinTransfer, sendMentoSwap, prepareStablecoinTransfer } from './services/transactions.js';


const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Internal User Route
app.post('/api/internal/user', async (req, res) => {
  try {
    const { telegramId, walletAddress } = req.body;
    if (!telegramId || !walletAddress) return res.status(400).json({ error: 'Missing parameters' });

    const user = await upsertUser({
      telegram_id: Number(telegramId),
      wallet_address: walletAddress,
      last_active_at: new Date().toISOString()
    });
    res.status(200).json(user);
  } catch (err: any) {
    console.error('User API error:', err);
    res.status(500).json({ error: err.message });
  }
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

// Internal Blockchain Route
app.post('/api/internal/blockchain', async (req, res) => {
    try {
        const { action, address, tokenSymbol } = req.body;
        
        if (action === 'balance') {
            if (!address) return res.status(400).json({ error: 'Missing address' });
            
            if (tokenSymbol) {
                const balance = await getBalance(address, tokenSymbol);
                return res.status(200).json(balance);
            } else {
                const balances = await getAllBalances(address);
                return res.status(200).json({ balances });
            }
        }
        
        res.status(400).json({ error: 'Invalid' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Helper to get userId from headers/body
const getInternalUserId = async (id: number | string) => {
    const user = await getUserByTelegramId(Number(id));
    return user?.id;
};

// Internal Mento Route
app.post('/api/internal/mento', async (req, res) => {
    try {
        const { action, tokenIn, tokenOut, amountIn, telegramId } = req.body;
        
        if (action === 'rate') {
            if (!tokenIn || !tokenOut) return res.status(400).json({ error: 'Missing tokens' });
            const result = await getExchangeRate(tokenIn, tokenOut, amountIn || '1');
            return res.status(200).json(result);
        } else if (action === 'swap') {
            if (!tokenIn || !tokenOut || !amountIn || !telegramId) return res.status(400).json({ error: 'Missing swap parameters' });
            const userId = await getInternalUserId(telegramId);
            if (!userId) return res.status(404).json({ error: 'User not found' });

            const result = await sendMentoSwap(userId, tokenIn, tokenOut, amountIn);
            return res.status(200).json(result);
        }
        
        res.status(400).json({ error: 'Invalid Mento action' });
    } catch (err: any) {
        console.error('Mento API error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Internal Transfer Route
app.post('/api/internal/transfer', async (req, res) => {
    try {
        const { to, amount, tokenSymbol, feeSymbol, telegramId } = req.body;
        
        if (!to || !amount || !tokenSymbol || !telegramId) {
            return res.status(400).json({ error: 'Missing transfer parameters' });
        }

        const userId = await getInternalUserId(telegramId);
        if (!userId) return res.status(404).json({ error: 'User not found' });

        console.log(`[Transfer] Executing autonomous transfer for user ${telegramId}`);
        
        // Execute the transfer directly using the Agent Wallet (Custodial Model)
        // sendStablecoinTransfer defaults to using the AGENT_PRIVATE_KEY
        const result = await sendStablecoinTransfer(
            userId, 
            to, 
            amount, 
            tokenSymbol, 
            feeSymbol || 'cUSD'
        );

        res.status(200).json(result);

    } catch (err: any) {
        console.error('Transfer API error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Telegram Webhook
app.post(['/webhooks/telegram', '/webhooks/telegram/'], async (req, res) => {
  console.log(`[TELEGRAM] Received webhook request: ${req.method} ${req.url}`);
  try {
    const update = req.body as TelegramBot.Update;
    console.log(`[TELEGRAM] Update body:`, JSON.stringify(update));
    const { chatId, text, userId } = parseTelegramUpdate(update);

    if (chatId && text && userId) {
      console.log(`[TELEGRAM] Routing message from ${userId} in chat ${chatId}: ${text}`);
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
