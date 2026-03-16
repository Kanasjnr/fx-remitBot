import dotenv from "dotenv";
import { sendTelegramMessage } from "./telegram.js";
import { getUserByTelegramId } from "../db/index.js";

dotenv.config();

// The token from ~/.openclaw/openclaw.json onboarding
const OPENCLAW_GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || "";
const OPENCLAW_GATEWAY_URL =
  process.env.OPENCLAW_GATEWAY_URL || "http://127.0.0.1:18789";

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

    const instructions = `You are RemitBot, a senior AI financial assistant for global remittances.
    ### MANDATORY PROTOCOL:
    1. You CANNOT execute transfers or schedules directly. You are a DRAFTING assistant.
    2. To propose a transfer, you MUST append this EXACT tag: [DRAFT_TX: to=0x..., amount=1.5, token=SYMBOL]
    3. To propose a recurring schedule, you MUST append this EXACT tag: [DRAFT_SCHEDULE: to=0x..., amount=10, token=TOKEN, frequencySeconds=86400, totalTransfers=12]
    4. **Smart Lookup**: If a user mentions a name (e.g., "Mama", "Valora"), you MUST call Tool #2 (LIST BENEFICIARIES) first to find their address.
    5. Always explain the draft to the user and tell them to "Click the Confirm button below."

    ### TOOLS:
    1. SAVE BENEFICIARY: curl -s -X POST http://127.0.0.1:3000/api/internal/beneficiary -H "Content-Type: application/json" -d '{"action": "add", "name": "NAME", "address": "0x...", "country": "COUNTRY", "preferredCurrency": "TOKEN", "telegramId": "${userId}"}'
    2. LIST BENEFICIARIES: curl -s -X POST http://127.0.0.1:3000/api/internal/beneficiary -H "Content-Type: application/json" -d '{"action": "list", "telegramId": "${userId}"}'
    3. CHECK BALANCES: curl -s -X POST http://127.0.0.1:3000/api/internal/blockchain -H "Content-Type: application/json" -d '{"action": "balance", "address": "${walletAddress}"}'

    User Telegram ID: ${userId}
    User's Agent Wallet: ${walletAddress} (Saved in DB, persistent)
    Currency Defaults: Nigeria=cNGN, Kenya=cKES, Philippines=cPHP, Brazil=cREAL, Europe=cEUR. Else cUSD.
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

    while (!isDone) {
      const payload = {
        model: "openclaw:main",
        input: messageHistory,
        instructions: instructions,
        user: sessionId,
      };

      const response = await fetch(`${OPENCLAW_GATEWAY_URL}/v1/responses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENCLAW_GATEWAY_TOKEN}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(`OpenClaw error: ${response.status}`);
      const data = await response.json();

      const outputs = data?.output || [];
      if (outputs.length === 0) {
        isDone = true;
        break;
      }

      let hasToolCall = false;

      for (const outputItem of outputs) {
        if (
          outputItem.type === "message" &&
          Array.isArray(outputItem.content)
        ) {
          const textContent = outputItem.content
            .filter((p: any) => p.type === "output_text")
            .map((p: any) => p.text)
            .join("\n\n");
          if (textContent) replyText += (replyText ? "\n\n" : "") + textContent;

          // Add to history for context
          messageHistory.push({
            type: "message",
            role: "assistant",
            content: outputItem.content.map((c: any) =>
              c.type === "output_text"
                ? { type: "input_text", text: c.text }
                : c,
            ),
          });
        }

        if (outputItem.type === "call") {
          hasToolCall = true;
          // Gateway usually handles the call, but we might get results back in a multi-step turn
          // For now, let's assume we need to break if the agent is done or continue if it's a tool-only turn
        }
      }

      // If no tool call was made, we are done
      if (!hasToolCall) {
        isDone = true;
      } else {
        // If there was a tool call, the gateway might have provided results in the same 'metadata' or 'output'
        // OpenClaw usually handles the tool result injection.
        // We'll set isDone = true for now to prevent infinite loops if instructions are bad,
        // but normally we'd loop again if there were tool results.
        isDone = true;
      }
    }

    console.log(`[OpenClaw] Final Agent Reply: ${replyText}`);

    if (replyText && chatId) {
      const txMatch = replyText.match(
        /\[DRAFT_TX:\s*to=([^,]+),\s*amount=([^,]+),\s*token=([^\]]+)\]/,
      );
      const schMatch = replyText.match(
        /\[DRAFT_SCHEDULE:\s*to=([^,]+),\s*amount=([^,]+),\s*token=([^,]+),\s*frequencySeconds=([^,]+),\s*totalTransfers=([^\]]+)\]/,
      );

      if (txMatch) {
        const [, to, amount, token] = txMatch;
        const cleanText = replyText.replace(/\[DRAFT_TX:.*?\]/, "").trim();
        await sendTelegramMessage(chatId, cleanText, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "✅ Confirm Transfer",
                  callback_data: `tx_c:${to}:${amount}:${token}`,
                },
                { text: "❌ Cancel", callback_data: `tx_can` },
              ],
            ],
          },
        });
      } else if (schMatch) {
        const [, to, amount, token, freq, total] = schMatch;
        const cleanText = replyText
          .replace(/\[DRAFT_SCHEDULE:.*?\]/, "")
          .trim();
        await sendTelegramMessage(chatId, cleanText, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "📅 Confirm Schedule",
                  callback_data: `sch_c:${to}:${amount}:${token}:${freq}:${total}`,
                },
                { text: "❌ Cancel", callback_data: `tx_can` },
              ],
            ],
          },
        });
      } else {
        await sendTelegramMessage(chatId, replyText);
      }
    }
  } catch (error) {
    console.error("[OpenClaw] Agent Error:", error);
    if (chatId)
      await sendTelegramMessage(chatId, `AI Brain Error. Please try /reset.`);
  } finally {
    processingUsers.delete(userId);
  }
}
