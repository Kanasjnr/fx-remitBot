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

          // 1. Execute the transfer directly (Autonomous/System Execution)
          const { sendStablecoinTransfer } = await import("./transactions.js");
          const txResult = await withRetry(
            async () => {
              return await sendStablecoinTransfer(
                schedule.user_id,
                schedule.beneficiaries?.address as `0x${string}`,
                schedule.amount.toString(),
                schedule.currency as any,
                "cUSD", // Use cUSD for gas by default
              );
            },
            2,
            2000,
            `Blockchain Execution for Schedule ${schedule.id}`,
          );

          // 2. Notify the user via AI after successful execution
          const prompt = `SYSTEM_CRON_EXECUTION_SUCCESS: I have just successfully executed your scheduled transfer of ${schedule.amount} ${schedule.currency} to ${schedule.beneficiaries?.name}. Transaction Hash: ${txResult.hash}. Please inform the user and share the explorer link: ${txResult.explorerUrl}`;

          await processIntentWithOpenClaw(
            schedule.users?.telegram_id.toString(),
            prompt,
            schedule.users?.telegram_id.toString(),
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
