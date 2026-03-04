import { Twilio } from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
const authToken = process.env.TWILIO_AUTH_TOKEN || '';

export const client = (accountSid && authToken) ? new Twilio(accountSid, authToken) : null;

export async function sendWhatsAppMessage(to: string, body: string) {
    if (!client) {
        console.warn('Twilio client not initialized.');
        return;
    }
    const from = process.env.WHATSAPP_BOT_NUMBER || '';
    await client.messages.create({
        from: `whatsapp:${from}`,
        to: `whatsapp:${to}`,
        body,
    });
}
