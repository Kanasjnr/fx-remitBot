import cron from "node-cron";
import {
  getPendingRecurringTransfers,
  updateRecurringTransfer,
} from "../db/index.js";
import { processIntentWithOpenClaw } from "./agent.js";
import { withRetry } from "./utils.js";
import { getBalance } from "./blockchain.js";
import { sendTelegramMessage } from "./telegram.js";

export function startCron() {
  console.log("[Cron] Starting recurring transfer service...");

  cron.schedule("* * * * *", async () => {
    try {
      const pending = await getPendingRecurringTransfers();

      if (!pending || pending.length === 0) {
        return;
      }

      console.log(`[Cron] Found ${pending.length} pending transfers.`);

      for (const schedule of pending) {
        try {
          console.log(
            `[Cron] Executing schedule ${schedule.id} for user ${schedule.users?.telegram_id}`,
          );

          const remaining = schedule.remaining_transfers - 1;
          const nextTime = new Date(
            Date.now() + Number(schedule.frequency_seconds) * 1000,
          ).toISOString();
          const status = remaining <= 0 ? "COMPLETED" : "ACTIVE";

          const agentAddress = process.env.AGENT_WALLET_ADDRESS;
          if (agentAddress) {
            try {
              const balance = await getBalance(
                agentAddress,
                schedule.currency as any,
              );
              if (Number(balance.formatted) < Number(schedule.amount)) {
                console.warn(
                  `[Cron] Insufficient balance for schedule ${schedule.id}. Required: ${schedule.amount} ${schedule.currency}, Available: ${balance.formatted}`,
                );

                await sendTelegramMessage(
                  schedule.users?.telegram_id,
                  `⚠️ *Scheduled Transfer Alert*\n\nYour scheduled transfer of *${schedule.amount} ${schedule.currency}* to *${schedule.beneficiaries?.name}* was skipped due to insufficient funds in the agent wallet.\n\nPlease top up \`${agentAddress}\` to resume.`,
                );

                await updateRecurringTransfer(schedule.id, {
                  next_execution_time: nextTime,
                });
                continue;
              }
            } catch (err) {
              console.error(
                `[Cron] Balance check failed for schedule ${schedule.id}:`,
                err,
              );
            }
          }

          await updateRecurringTransfer(schedule.id, {
            remaining_transfers: remaining,
            next_execution_time: nextTime,
            status,
          });

          const prompt = `SYSTEM_CRON_EXECUTION: Please execute a transfer of ${schedule.amount} ${schedule.currency} to beneficiary "${schedule.beneficiaries?.name}" (Address: ${schedule.beneficiaries?.address}). This is a scheduled payment. Inform the user of the success via Telegram.`;

          await withRetry(
            async () => {
              return await processIntentWithOpenClaw(
                schedule.users?.telegram_id.toString(),
                prompt,
                schedule.users?.telegram_id.toString(),
              );
            },
            2,
            2000,
            `Agent Execution for Schedule ${schedule.id}`,
          );
        } catch (innerError) {
          console.error(
            `[Cron] Error executing schedule ${schedule.id}:`,
            innerError,
          );
        }
      }
    } catch (error) {
      console.error("[Cron] Critical error in cron tick:", error);
    }
  });
}
