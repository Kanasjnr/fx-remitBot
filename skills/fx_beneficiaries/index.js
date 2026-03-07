"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const openclaw_1 = require("openclaw");
const node_fetch_1 = __importDefault(require("node-fetch"));
exports.default = (0, openclaw_1.createSkill)({
    id: 'fx_beneficiaries',
    name: 'Beneficiary Manager',
    description: 'Manages saved contacts/beneficiaries for Celo remittances.',
    tools: {
        add_beneficiary: {
            description: 'Add a new contact/beneficiary with their Celo wallet address.',
            parameters: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'The name or nickname of the beneficiary (e.g., Mama, Steve, John Doe).',
                    },
                    address: {
                        type: 'string',
                        description: 'The Celo wallet address (starting with 0x).',
                    },
                },
                required: ['name', 'address'],
            },
            execute: async ({ name, address }, { session }) => {
                try {
                    // We need the telegram ID of the user. OpenClaw sessions usually contain the user identifier.
                    const userId = session?.user?.id || session?.id?.replace('telegram_', '');
                    if (!userId) {
                        return { error: 'Could not resolve Telegram User ID from session.' };
                    }
                    const response = await (0, node_fetch_1.default)('http://127.0.0.1:3000/api/internal/beneficiary', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'add', name, address, telegramId: userId })
                    });
                    return await response.json();
                }
                catch (err) {
                    return { error: err.message };
                }
            },
        },
        list_beneficiaries: {
            description: 'List all saved contacts/beneficiaries for the current user.',
            parameters: {
                type: 'object',
                properties: {},
            },
            execute: async (_, { session }) => {
                try {
                    const userId = session?.user?.id || session?.id?.replace('telegram_', '');
                    if (!userId) {
                        return { error: 'Could not resolve Telegram User ID from session.' };
                    }
                    const response = await (0, node_fetch_1.default)('http://127.0.0.1:3000/api/internal/beneficiary', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'list', telegramId: userId })
                    });
                    return await response.json();
                }
                catch (err) {
                    return { error: err.message };
                }
            },
        },
    },
});
//# sourceMappingURL=index.js.map