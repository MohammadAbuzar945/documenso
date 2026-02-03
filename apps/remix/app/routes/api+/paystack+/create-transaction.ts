import { z } from "zod";
import { createTransaction } from "@documenso/lib/server-only/paystack";

const createTransactionSchema = z.object({
  email: z.string().email(),
  amount: z.number().positive(),
  plan: z.string().optional(),
  invoice_limit: z.number().optional(),
  callback_url: z.string().url().optional(),
  metadata: z.number().optional(),
});

interface CreateTransactionResponse {
  success: boolean;
  data?: {
    authorization_url: string;
    reference: string;
  };
  error?: string;
}

export async function action({ request }: { request: Request }) {
  try {
    const body = await request.json();
    const validatedData = createTransactionSchema.parse(body);
    
    // Transform metadata to match expected type
    const transactionData = {
      ...validatedData,
      metadata: validatedData.metadata ? { value: validatedData.metadata } : undefined
    };

    const transaction = await createTransaction(transactionData);

    if (!transaction.data) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to initialize transaction",
        } satisfies CreateTransactionResponse),
        { status: 500 }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          authorization_url: transaction.data.authorization_url,
          reference: transaction.data.reference,
        },
      } satisfies CreateTransactionResponse),
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid request data",
        } satisfies CreateTransactionResponse),
        { status: 400 }
      );
    }

    console.error("Paystack transaction error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
      } satisfies CreateTransactionResponse),
      { status: 500 }
    );
  }
}
