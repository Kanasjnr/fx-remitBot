import express from 'express';
import dotenv from 'dotenv';
import { json } from 'body-parser';
import { routeMessage } from './services/router.js';

dotenv.config();

const app = express();
app.use(json());

const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
    res.send({ status: 'OK' });
});

// Telegram Webhook
app.post('/webhooks/telegram', async (req, res) => {
    const { message } = req.body;
    if (message && message.text) {
        await routeMessage({
            platform: 'telegram',
            senderId: message.from.id.toString(),
            text: message.text,
            raw: req.body
        });
    }
    res.sendStatus(200);
});

// WhatsApp Webhook (Twilio)
app.post('/webhooks/whatsapp', async (req, res) => {
    const { From, Body } = req.body;
    if (From && Body) {
        await routeMessage({
            platform: 'whatsapp',
            senderId: From,
            text: Body,
            raw: req.body
        });
    }
    res.sendStatus(200);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
