import dotenv from "dotenv";
import { sendTelegramMessage } from "./telegram.js";
import { getUserByTelegramId } from "../db/index.js";

dotenv.config();

// The token from ~/.openclaw/openclaw.json onboarding
const OPENCLAW_GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || "";
const OPENCLAW_GATEWAY_URL =
  process.env.OPENCLAW_GATEWAY_URL || "http://127.0.0.1:18789";

console.log(`[OpenClaw] Using Gateway URL: ${OPENCLAW_GATEWAY_URL}`);

// CONCURRENCY LOCK: Prevent duplicate processing if two requests hit at once
const processingUsers = new Set<string>();

// SESSION VERSIONING: Track session versions for true resets
const sessionVersions = new Map<string, number>();

export function resetAgentSession(userId: string) {
  const current = sessionVersions.get(userId) || 1;
  sessionVersions.set(userId, current + 1);
  console.log(
    `[Agent] Reset session for user ${userId} to version ${current + 1}`,
  );
}

export async function processIntentWithOpenClaw(
  userId: string,
  text: string,
  chatId?: string,
) {
  // 1. Concurrency Check
  if (processingUsers.has(userId)) {
    console.log(
      `[OpenClaw] Already processing user ${userId}, skipping duplicate.`,
    );
    return;
  }
  processingUsers.add(userId);

  try {
    console.log(`[OpenClaw] Sending message from user ${userId} to Agent...`);

    const version = sessionVersions.get(userId) || 1;
    const sessionId = `telegram_${userId}_v${version}`;
    const user = await getUserByTelegramId(parseInt(userId));
    const walletAddress = user?.wallet_address || "NOT_SET";

    const serverUrl = process.env.BACKEND_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;

    const instructions = `You are RemitBot, a senior AI financial assistant for global remittances.
    ### IDENTITY & CONTEXT:
    - You are in a PRIVATE 1-on-1 chat with the user.
    - User Telegram ID: ${userId}. YOU MUST USE THIS ID for all tool calls. NEVER ask the user for their ID.
    - User's Agent Wallet: ${walletAddress}.
    - Backend API: ${serverUrl}

    ### MANDATORY PROTOCOL:
    1. **Execution**: You CANNOT execute transfers or schedules directly. You are a DRAFTING assistant.
    2. **Drafting**: To propose a transfer, append: [DRAFT_TX: to=0x..., amount=1.5, token=SYMBOL]
    3. **Scheduling**: To propose a schedule, append: [DRAFT_SCHEDULE: to=0x..., amount=10, token=TOKEN, frequencySeconds=86400, totalTransfers=12]
    4. **Swapping**: To propose a swap, append: [DRAFT_SWAP: from=SYMBOL, to=SYMBOL, amount=1.5]
    5. **Smart Lookup**: If a user mentions a name, you MUST call Tool #2 (LIST BENEFICIARIES) to find their address.
    6. **Schedules**: To see/cancel schedules, you MUST call Tool #4 or #5.
    
    ### TOOLS (Call these to get data or perform actions):
    1. SAVE BENEFICIARY: curl -s -X POST ${serverUrl}/api/internal/beneficiary -H "Content-Type: application/json" -d '{"action": "add", "name": "NAME", "address": "0x...", "telegramId": "${userId}"}'
    2. LIST BENEFICIARIES: curl -s -X POST ${serverUrl}/api/internal/beneficiary -H "Content-Type: application/json" -d '{"action": "list", "telegramId": "${userId}"}'
    3. DELETE BENEFICIARY: curl -s -X POST ${serverUrl}/api/internal/beneficiary -H "Content-Type: application/json" -d '{"action": "delete", "name": "NAME", "telegramId": "${userId}"}'
    4. LIST SCHEDULES: curl -s -X POST ${serverUrl}/api/internal/schedule -H "Content-Type: application/json" -d '{"action": "list", "telegramId": "${userId}"}'
    5. CANCEL SCHEDULE: curl -s -X POST ${serverUrl}/api/internal/schedule -H "Content-Type: application/json" -d '{"action": "cancel", "scheduleId": "ID", "telegramId": "${userId}"}'
    6. CHECK BALANCES: curl -s -X POST ${serverUrl}/api/internal/blockchain -H "Content-Type: application/json" -d '{"action": "balance", "address": "${walletAddress}"}'
    7. CHECK EXCHANGE RATES: curl -s -X POST ${serverUrl}/api/internal/mento -H "Content-Type: application/json" -d '{"action": "rate", "tokenIn": "SYMBOL", "tokenOut": "SYMBOL", "amountIn": "1"}'

    Currency Defaults: Nigeria=cNGN, Kenya=cKES, Philippines=cPHP, Brazil=cREAL, Europe=cEUR. Else cUSD.
    Note: USDm is an alias for cUSD. Both are interchangeable and supported.
    `;

    let replyText = "";
    let isDone = false;
    let messageHistory: any[] = [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: text }],
      },
    ];

    let turnCount = 0;
    while (!isDone && turnCount < 5) {
      turnCount++;
      const payload = {
        model: "openclaw:main",
        input: messageHistory,
        instructions: instructions,
        user: sessionId,
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      let data: any;
      try {
        const response = await fetch(`${OPENCLAW_GATEWAY_URL}/v1/responses`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENCLAW_GATEWAY_TOKEN}`,
            "ngrok-skip-browser-warning": "true",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`OpenClaw error: ${response.status}`);
        data = await response.json();
      } catch (err: any) {
        clearTimeout(timeoutId);
        throw err;
      }

      const outputs = data?.output || [];
      if (outputs.length === 0) {
        isDone = true;
        break;
      }

      let hasToolCall = false;
      for (const outputItem of outputs) {
        if (outputItem.type === "message" && Array.isArray(outputItem.content)) {
          const textContent = outputItem.content
            .filter((p: any) => p.type === "output_text")
            .map((p: any) => p.text)
            .join("\n\n");
          if (textContent) replyText += (replyText ? "\n\n" : "") + textContent;

          messageHistory.push({
            type: "message",
            role: "assistant",
            content: outputItem.content.map((c: any) =>
              c.type === "output_text" ? { type: "input_text", text: c.text } : c
            ),
          });
        }

        if (outputItem.type === "call") {
          hasToolCall = true;
          const { method, params, id: callId } = outputItem;
          console.log(`[OpenClaw] Tool Call: ${method}`, params);

          let toolResult = "";
          try {
            // Map tool names to internal API endpoints
            let endpoint = "";
            let body = { ...params, telegramId: userId };

            if (method.includes("BENEFICIARY")) endpoint = "/api/internal/beneficiary";
            else if (method.includes("SCHEDULE")) endpoint = "/api/internal/schedule";
            else if (method.includes("BALANCE")) endpoint = "/api/internal/blockchain";
            else if (method.includes("RATE")) endpoint = "/api/internal/mento";

            if (endpoint) {
              const toolResponse = await fetch(`${serverUrl}${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              });
              toolResult = await toolResponse.text();
            } else {
              toolResult = `Error: Unknown tool or missing endpoint for method ${method}`;
            }
          } catch (e: any) {
            toolResult = `Error executing tool: ${e.message}`;
          }

          messageHistory.push({
            type: "call_result",
            call_id: callId,
            content: [{ type: "output_text", text: toolResult }],
          });
        }
      }

      if (!hasToolCall) {
        isDone = true;
      }
    }

    console.log(`[OpenClaw] Final Agent Reply: ${replyText}`);

    if (replyText && chatId) {
      const txMatch = replyText.match(/\[DRAFT_TX:\s*to=([^,]+),\s*amount=([^,]+),\s*token=([^\]]+)\]/);
      const schMatch = replyText.match(/\[DRAFT_SCHEDULE:\s*to=([^,]+),\s*amount=([^,]+),\s*token=([^,]+),\s*frequencySeconds=([^,]+),\s*totalTransfers=([^\]]+)\]/);

      if (txMatch) {
        const [, to, amount, token] = txMatch;
        const cleanText = replyText.replace(/\[DRAFT_TX:.*?\]/, "").trim();
        await sendTelegramMessage(chatId, cleanText, {
          reply_markup: {
            inline_keyboard: [[
              { text: "Confirm Transfer", callback_data: `tx_c:${to}:${amount}:${token}` },
              { text: "Cancel", callback_data: `tx_can` }
            ]]
          }
        });
      } else if (schMatch) {
        const [, to, amount, token, freq, total] = schMatch;
        const cleanText = replyText.replace(/\[DRAFT_SCHEDULE:.*?\]/, "").trim();
        await sendTelegramMessage(chatId, cleanText, {
          reply_markup: {
            inline_keyboard: [[
              { text: "Confirm Schedule", callback_data: `sch_c:${to}:${amount}:${token}:${freq}:${total}` },
              { text: "Cancel", callback_data: `tx_can` }
            ]]
          }
        });
      } else if (replyText.includes("[DRAFT_SWAP:")) {
        const swapMatch = replyText.match(/\[DRAFT_SWAP:\s*from=([^,]+),\s*to=([^,]+),\s*amount=([^\]]+)\]/);
        if (swapMatch) {
          const [, from, to, amount] = swapMatch;
          const cleanText = replyText.replace(/\[DRAFT_SWAP:.*?\]/, "").trim();
          await sendTelegramMessage(chatId, cleanText, {
            reply_markup: {
              inline_keyboard: [[
                { text: `Swap ${amount} ${from} to ${to}`, callback_data: `swap_c:${from}:${to}:${amount}` },
                { text: "Cancel", callback_data: `tx_can` }
              ]]
            }
          });
        }
      } else {
        await sendTelegramMessage(chatId, replyText);
      }
    }
  } catch (error: any) {
    console.error("[OpenClaw] Agent Error:", error);
    if (chatId) {
      await sendTelegramMessage(chatId, `AI Error: ${error.message || "Brain fog."} Try /reset.`);
    }
  } finally {
    processingUsers.delete(userId);
  }
}
