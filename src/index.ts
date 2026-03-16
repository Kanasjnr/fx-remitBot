import "./services/utils.js";
import express from "express";
import type TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import {
  setTelegramWebhook,
  registerBotCommands,
  parseTelegramUpdate,
  bot,
} from "./services/telegram.js";
import { routeMessage } from "./services/router.js";
import { executeBeneficiaryTool } from "./services/tools/beneficiaries.js";
import {
  getAllBalances,
  getBalance,
  getAllowance,
} from "./services/blockchain.js";
import {
  getUserByTelegramId,
  upsertUser,
  logTransaction,
  createRecurringTransfer,
  getRecurringTransfers,
  updateRecurringTransfer,
} from "./db/index.js";
import { getExchangeRate } from "./services/mento.js";
import {
  sendStablecoinTransfer,
  sendMentoSwap,
  prepareStablecoinTransfer,
} from "./services/transactions.js";
import { startCron } from "./services/cron.js";

import { jsonSafeReplacer } from "./services/utils.js";

const app = express();
app.use(express.json());

// Apply global JSON replacer to all Express responses
app.set("json replacer", jsonSafeReplacer);

const PORT = process.env.PORT || 3000;

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Internal User Route
app.post("/api/internal/user", async (req, res) => {
  try {
    const { telegramId, walletAddress } = req.body;
    if (!telegramId || !walletAddress)
      return res.status(400).json({ error: "Missing parameters" });

    const user = await upsertUser({
      telegram_id: Number(telegramId),
      wallet_address: walletAddress,
      last_active_at: new Date().toISOString(),
    });
    res.status(200).json(user);
  } catch (err: any) {
    console.error("User API error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Internal OpenClaw Skill Execution Route
app.post("/api/internal/beneficiary", async (req, res) => {
  try {
    const {
      action,
      name,
      address,
      country,
      preferred_currency,
      preferredCurrency,
      telegramId,
    } = req.body;

    if (!telegramId) {
      return res.status(400).json({ error: "Missing telegramId" });
    }

    let toolName = "";
    let args: any = {};

    if (action === "add") {
      toolName = "add_beneficiary";
      args = { name, address, country, preferred_currency, preferredCurrency };
    } else if (action === "list") {
      toolName = "list_beneficiaries";
    } else {
      return res.status(400).json({ error: "Invalid action" });
    }

    const resultString = await executeBeneficiaryTool(
      toolName,
      args,
      telegramId,
    );
    res.status(200).json(JSON.parse(resultString));
  } catch (err: any) {
    console.error("Internal API error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Internal Blockchain Route
app.post("/api/internal/blockchain", async (req, res) => {
  try {
    const { action, address, tokenSymbol } = req.body;

    if (action === "balance") {
      if (!address) return res.status(400).json({ error: "Missing address" });

      if (tokenSymbol) {
        const balance = await getBalance(address, tokenSymbol);
        return res.status(200).json(balance);
      } else {
        const balances = await getAllBalances(address);
        return res.status(200).json({ balances });
      }
    }

    res.status(400).json({ error: "Invalid" });
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
app.post("/api/internal/mento", async (req, res) => {
  try {
    const { action, tokenIn, tokenOut, amountIn, telegramId } = req.body;

    if (action === "rate") {
      if (!tokenIn || !tokenOut)
        return res.status(400).json({ error: "Missing tokens" });
      const result = await getExchangeRate(tokenIn, tokenOut, amountIn || "1");
      return res.status(200).json(result);
    } else if (action === "swap") {
      if (!tokenIn || !tokenOut || !amountIn || !telegramId)
        return res.status(400).json({ error: "Missing swap parameters" });
      const userId = await getInternalUserId(telegramId);
      if (!userId) return res.status(404).json({ error: "User not found" });

      const result = await sendMentoSwap(userId, tokenIn, tokenOut, amountIn);
      return res.status(200).json(result);
    }

    res.status(400).json({ error: "Invalid Mento action" });
  } catch (err: any) {
    console.error("Mento API error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Internal Transfer Route
app.post("/api/internal/transfer", async (req, res) => {
  try {
    const { to, amount, tokenSymbol, feeSymbol, telegramId } = req.body;

    if (!to || !amount || !tokenSymbol || !telegramId) {
      return res.status(400).json({ error: "Missing transfer parameters" });
    }

    const userId = await getInternalUserId(telegramId);
    if (!userId) return res.status(404).json({ error: "User not found" });

    console.log(
      `[Transfer] Executing autonomous transfer for user ${telegramId}`,
    );

    // Execute the transfer directly using the Agent Wallet (Custodial Model)
    // sendStablecoinTransfer defaults to using the AGENT_PRIVATE_KEY
    const result = await sendStablecoinTransfer(
      userId,
      to,
      amount,
      tokenSymbol,
      feeSymbol || "cUSD",
    );

    res.status(200).json(result);
  } catch (err: any) {
    console.error("Transfer API error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Internal Scheduling Route
app.post("/api/internal/schedule", async (req, res) => {
  console.log("[Schedule API] Request Body:", JSON.stringify(req.body));
  try {
    const {
      action,
      telegramId,
      beneficiaryId,
      amount,
      currency,
      frequencySeconds,
      totalTransfers,
      scheduleId,
    } = req.body;

    const userId = await getInternalUserId(telegramId);
    if (!userId) return res.status(404).json({ error: "User not found" });

    if (action === "create") {
      if (
        !beneficiaryId ||
        !amount ||
        !currency ||
        !frequencySeconds ||
        !totalTransfers
      ) {
        return res.status(400).json({ error: "Missing scheduling parameters" });
      }

      const nextExecutionTime = new Date(
        Date.now() + Number(frequencySeconds) * 1000,
      ).toISOString();

      const payload = {
        user_id: userId,
        beneficiary_id: beneficiaryId,
        amount: Number(amount),
        currency,
        frequency_seconds: Number(frequencySeconds),
        total_transfers: Number(totalTransfers),
        remaining_transfers: Number(totalTransfers),
        next_execution_time: nextExecutionTime,
        status: "ACTIVE",
      };

      const schedule = await createRecurringTransfer(payload as any);

      return res.status(200).json({ success: true, schedule });
    } else if (action === "list") {
      const schedules = await getRecurringTransfers(userId);
      return res.status(200).json({ success: true, schedules });
    } else if (action === "cancel") {
      if (!scheduleId)
        return res.status(400).json({ error: "Missing scheduleId" });
      const result = await updateRecurringTransfer(scheduleId, {
        status: "CANCELLED",
      });
      return res.status(200).json({ success: true, result });
    }

    res.status(400).json({ error: "Invalid scheduling action" });
  } catch (err: any) {
    console.error("Scheduling API error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Telegram Webhook
const processedUpdates = new Set<number>();

app.post(["/webhooks/telegram", "/webhooks/telegram/"], async (req, res) => {
  const update = req.body as TelegramBot.Update;

  // 1. Immediate acknowledgment to prevent Telegram retries
  res.sendStatus(200);

  // 2. Idempotency check
  if (processedUpdates.has(update.update_id)) {
    console.log(`[TELEGRAM] Skipping duplicate update: ${update.update_id}`);
    return;
  }
  processedUpdates.add(update.update_id);

  // Cleanup old updates (keep last 100)
  if (processedUpdates.size > 100) {
    const firstValue = processedUpdates.values().next().value;
    if (firstValue !== undefined) processedUpdates.delete(firstValue);
  }

  console.log(`[TELEGRAM] Received webhook request: ${req.method} ${req.url}`);
  try {
    const { chatId, text, userId } = parseTelegramUpdate(update);

    // 3. Handle Callback Queries (Button Clicks)
    if (update.callback_query) {
      const { id, data, from, message } = update.callback_query;
      console.log(
        `[TELEGRAM] Callback query received: ${data} from ${from.id}`,
      );

      // --- PHASE 4 DASHBOARD HANDLERS ---
      if (data === "menu_send") {
        await bot?.answerCallbackQuery(id);
        await bot?.sendMessage(
          from.id,
          "💸 *Where would you like to send money?*\n\nYou can type things like:\n- _'Send $10 to Mama'_\n- _'Remit 5 cNGN to 0x...'_",
          { parse_mode: "Markdown" },
        );
        return;
      }
      if (data === "menu_balance") {
        await bot?.answerCallbackQuery(id, { text: "Checking balance..." });
        const { processIntentWithOpenClaw } =
          await import("./services/agent.js");
        await processIntentWithOpenClaw(
          from.id.toString(),
          "check my balance",
          from.id.toString(),
        );
        return;
      }
      if (data === "menu_contacts") {
        await bot?.answerCallbackQuery(id, { text: "Opening contacts..." });
        const { processIntentWithOpenClaw } =
          await import("./services/agent.js");
        await processIntentWithOpenClaw(
          from.id.toString(),
          "list my beneficiaries",
          from.id.toString(),
        );
        return;
      }
      if (data === "menu_help") {
        await bot?.answerCallbackQuery(id);
        const { routeMessage } = await import("./services/router.js");
        await routeMessage({
          platform: "telegram",
          senderId: from.id.toString(),
          text: "/help",
          chatId: from.id.toString(),
          raw: body,
        });
        return;
      }
      if (data === "menu_reset") {
        await bot?.answerCallbackQuery(id);
        const { routeMessage } = await import("./services/router.js");
        await routeMessage({
          platform: "telegram",
          senderId: from.id.toString(),
          text: "/reset",
          chatId: from.id.toString(),
          raw: body,
        });
        return;
      }
      if (data === "reset_confirm") {
        const { resetAgentSession } = await import("./services/agent.js");
        resetAgentSession(from.id.toString());
        await bot?.answerCallbackQuery(id, { text: "Context cleared." });
        if (message) {
          await bot?.editMessageText(
            `${message.text}\n\n🧹 *Session Reset Successfully.* I've cleared my memory.`,
            {
              chat_id: message.chat.id,
              message_id: message.message_id,
              parse_mode: "Markdown",
            },
          );
        }
        return;
      }

      if (data?.startsWith("tx_c:")) {
        const [, to, amount, token] = data.split(":");
        const internalUserId = await getInternalUserId(from.id);

        if (internalUserId && message) {
          // Tell the user we're executing
          await bot?.answerCallbackQuery(id, { text: "Executing transfer..." });
          await bot?.editMessageText(`${message.text}\n\n⏳ *Executing...*`, {
            chat_id: message.chat.id,
            message_id: message.message_id,
            parse_mode: "Markdown",
          });

          try {
            const result = await sendStablecoinTransfer(
              internalUserId,
              to,
              amount,
              token,
            );
            await bot?.editMessageText(
              `${message.text}\n\n✅ *Transfer Successful!*\n👤 *Recipient:* \`${to}\`\n💰 *Amount:* ${amount} ${token}\n⛽ *Fee:* Paid in cUSD\n🔗 [View on Explorer](https://celoscan.io/tx/${result.hash})`,
              {
                chat_id: message.chat.id,
                message_id: message.message_id,
                parse_mode: "Markdown",
              },
            );
          } catch (txErr: any) {
            await bot?.editMessageText(
              `${message.text}\n\n❌ *Transfer Failed*\nError: ${txErr.message}`,
              {
                chat_id: message.chat.id,
                message_id: message.message_id,
                parse_mode: "Markdown",
              },
            );
          }
        }
        return;
      }

      if (data === "tx_can") {
        if (message) {
          await bot?.answerCallbackQuery(id, { text: "Transfer cancelled." });
          await bot?.editMessageText(
            `${message.text}\n\n❌ *Transfer Cancelled.*`,
            {
              chat_id: message.chat.id,
              message_id: message.message_id,
              parse_mode: "Markdown",
            },
          );
        }
        return;
      }

      if (data?.startsWith("sch_c:")) {
        const [, to, amount, token, freq, total] = data.split(":");
        const internalUserId = await getInternalUserId(from.id);

        if (internalUserId && message) {
          await bot?.answerCallbackQuery(id, { text: "Scheduling..." });
          await bot?.editMessageText(
            `${message.text}\n\n⏳ *Scheduling recurring transfer...*`,
            {
              chat_id: message.chat.id,
              message_id: message.message_id,
              parse_mode: "Markdown",
            },
          );

          try {
            // We need a beneficiary ID for the schedule.
            // In a real app, we'd lookup by address. For now, let's assume 'to' might be a name or address.
            // If it's an address, we can use it directly in our modified store logic or create a temp beneficiary.
            const payload = {
              user_id: internalUserId,
              beneficiary_id: to, // Pass the 'to' address directly for now as our schema might allow it or we'll map it
              amount: Number(amount),
              currency: token,
              frequency_seconds: Number(freq),
              total_transfers: Number(total),
              remaining_transfers: Number(total),
              next_execution_time: new Date(
                Date.now() + Number(freq) * 1000,
              ).toISOString(),
              status: "ACTIVE",
            };

            await createRecurringTransfer(payload as any);
            await bot?.editMessageText(
              `${message.text}\n\n📅 *Schedule Active!*\n👤 *Recipient:* \`${to}\`\n💰 *Amount:* ${amount} ${token}\n⏱️ *Frequency:* Every ${freq}s\n🔢 *Total Transfers:* ${total}`,
              {
                chat_id: message.chat.id,
                message_id: message.message_id,
                parse_mode: "Markdown",
              },
            );
          } catch (err: any) {
            await bot?.editMessageText(
              `${message.text}\n\n❌ *Schedule Failed*\nError: ${err.message}`,
              {
                chat_id: message.chat.id,
                message_id: message.message_id,
                parse_mode: "Markdown",
              },
            );
          }
        }
        return;
      }

      await bot?.answerCallbackQuery(id);
      return;
    }

    if (chatId && text && userId) {
      console.log(
        `[TELEGRAM] Routing message from ${userId} in chat ${chatId}: ${text}`,
      );
      await routeMessage({
        platform: "telegram",
        senderId: userId.toString(),
        chatId: chatId.toString(),
        text,
        raw: update,
      });
    }
  } catch (err) {
    console.error("Telegram webhook error:", err);
  }
});

// Start server
app.listen(PORT, async () => {
  console.log(` FX RemitBot server running on port ${PORT}`);
  startCron();

  const backendUrl = process.env.BACKEND_URL;
  if (backendUrl) {
    await setTelegramWebhook(backendUrl);
    await registerBotCommands();
  } else {
    console.log(
      " BACKEND_URL not set. Set it with ngrok URL to register Telegram webhook.",
    );
  }
});

export default app;
