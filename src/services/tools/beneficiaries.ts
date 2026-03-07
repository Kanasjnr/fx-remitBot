import { supabase, upsertUser } from '../../db/index.js';

// Define the schemas for OpenClaw tools
export const beneficiaryTools = [
  {
    type: 'function',
    function: {
      name: 'add_beneficiary',
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
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_beneficiaries',
      description: 'List all saved contacts/beneficiaries for the current user.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
];

export async function executeBeneficiaryTool(
  toolName: string,
  args: any,
  telegramId: string
): Promise<string> {
  // Ensure user exists before performing beneficiary operations
  const user = await upsertUser({ telegram_id: parseInt(telegramId) });
  
  if (!user || !user.id) {
    return JSON.stringify({ error: 'User could not be found or created in the database.' });
  }

  try {
    switch (toolName) {
      case 'add_beneficiary': {
        const { name, address } = args;
        
        if (!name || !address || !address.startsWith('0x')) {
            return JSON.stringify({ error: 'Invalid name or Celo address provided.' });
        }

        const { data, error } = await supabase
          .from('beneficiaries')
          .insert({
            user_id: user.id,
            name: name,
            address: address,
          })
          .select()
          .single();

        if (error) {
           if (error.code === '23505') { // Unique constraint violation
               return JSON.stringify({ error: `You already have a contact named ${name}.` });
           }
           throw error;
        }

        return JSON.stringify({ success: true, message: `Beneficiary ${name} added successfully!`, data });
      }

      case 'list_beneficiaries': {
        const { data, error } = await supabase
          .from('beneficiaries')
          .select('*')
          .eq('user_id', user.id);

        if (error) throw error;
        
        if (!data || data.length === 0) {
            return JSON.stringify({ message: 'You have no saved contacts yet.' });
        }
        
        return JSON.stringify({ beneficiaries: data });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (error: any) {
    console.error(`[BeneficiaryTool] Error executing ${toolName}:`, error);
    return JSON.stringify({ error: error.message || 'An unexpected database error occurred.' });
  }
}
