export type MessagePlatform = 'telegram' | 'whatsapp';

export interface IncomingMessage {
    platform: MessagePlatform;
    senderId: string;
    text: string;
    raw: any;
}

export async function routeMessage(message: IncomingMessage) {
    console.log(`Routing message from ${message.platform}: ${message.text}`);
    // TODO: Integrate OpenClaw for intent parsing
}
