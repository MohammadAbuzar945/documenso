import { z } from 'zod';

import { initializeTransaction } from '@documenso/lib/server-only/paystack';

const initializeTransactionSchema = z.object({
  email: z.string().email(),
  amount: z.number().positive(),
  plan: z.string().optional(),
  callback_url: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function action({ request }: { request: Request }) {
  try {
    const body = await request.json();
    const validatedData = initializeTransactionSchema.parse(body);

    const transaction = await initializeTransaction(validatedData);

    if (!transaction.data) {
      return new Response(JSON.stringify({ error: 'Failed to initialize transaction' }), {
        status: 500,
      });
    }

    return new Response(
      JSON.stringify({
        authorization_url: transaction.data.authorization_url,
        reference: transaction.data.reference,
      }),
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({
          error: 'Invalid request data',
        }),
        { status: 400 },
      );
    }

    console.error('Paystack initialize error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
      }),
      { status: 500 },
    );
  }
}

