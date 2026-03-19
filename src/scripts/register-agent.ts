import { registerRemittanceAgent } from '../services/agentIdentity.js';

async function main() {
    try {
        await registerRemittanceAgent();
        process.exit(0);
    } catch (error) {
        console.error('Registration failed:', error);
        process.exit(1);
    }
}

main();
