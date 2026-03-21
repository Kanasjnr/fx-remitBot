import { supabase, upsertUser } from "../../db/index.js";

// Define the schemas for OpenClaw tools
export const beneficiaryTools = [
  {
    type: "function",
    function: {
      name: "add_beneficiary",
      description:
        "Add a new contact/beneficiary with their Celo wallet address.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description:
              "The name or nickname of the beneficiary (e.g., Mama, Steve, John Doe).",
          },
          address: {
            type: "string",
            description: "The Celo wallet address (starting with 0x).",
          },
          country: {
            type: "string",
            description:
              "The country of the beneficiary (e.g., Nigeria, Kenya).",
          },
          preferred_currency: {
            type: "string",
            description: "The preferred Mento token symbol (e.g., cNGN, cKES).",
          },
        },
        required: ["name", "address"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_beneficiaries",
      description:
        "List all saved contacts/beneficiaries for the current user.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_beneficiary",
      description:
        "Remove/delete a saved contact or beneficiary from your list.",
      parameters: {
        type: "object",
        properties: {
          identifier: {
            type: "string",
            description:
              "The name, nickname, or Celo address of the beneficiary to delete.",
          },
        },
        required: ["identifier"],
      },
    },
  },
];

export async function executeBeneficiaryTool(
  toolName: string,
  args: any,
  telegramId: string,
): Promise<string> {
  // Ensure user exists before performing beneficiary operations
  const user = await upsertUser({ telegram_id: parseInt(telegramId) });

  if (!user || !user.id) {
    return JSON.stringify({
      error: "User could not be found or created in the database.",
    });
  }

  try {
    switch (toolName) {
      case "add_beneficiary": {
        const {
          name,
          address,
          country,
          preferred_currency,
          preferredCurrency,
        } = args;

        if (!name || !address || !address.startsWith("0x")) {
          return JSON.stringify({
            error: "Invalid name or Celo address provided.",
          });
        }

        const { data, error } = await supabase
          .from("beneficiaries")
          .insert({
            user_id: user.id,
            name: name,
            address: address,
            country: country,
            preferred_currency: preferred_currency || preferredCurrency,
          })
          .select()
          .single();

        if (error) {
          if (error.code === "23505") {
            // Unique constraint violation
            return JSON.stringify({
              error: `You already have a contact named ${name}.`,
            });
          }
          throw error;
        }

        return JSON.stringify({
          success: true,
          message: `Beneficiary ${name} added successfully!`,
          data,
        });
      }

      case "list_beneficiaries": {
        const { data, error } = await supabase
          .from("beneficiaries")
          .select("*")
          .eq("user_id", user.id);

        if (error) throw error;

        if (!data || data.length === 0) {
          return JSON.stringify({ message: "You have no saved contacts yet." });
        }

        return JSON.stringify({ beneficiaries: data });
      }
 
      case "delete_beneficiary": {
        const { identifier } = args;
        if (!identifier) {
          return JSON.stringify({ error: "Missing identifier for deletion." });
        }
 
        const { deleteBeneficiary } = await import("../../db/index.js");
        const result = await deleteBeneficiary(user.id, identifier);
 
        return JSON.stringify(result);
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (error: any) {
    console.error(`[BeneficiaryTool] Error executing ${toolName}:`, error);
    return JSON.stringify({
      error: error.message || "An unexpected database error occurred.",
    });
  }
}
