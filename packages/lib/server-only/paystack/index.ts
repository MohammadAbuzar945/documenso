import { Paystack } from 'paystack-sdk';
import { any } from 'zod';

import { env } from '../../utils/env';

const paystack = new Paystack(env('NEXT_PAYSTACK_TEST_KEY') ?? env('NEXT_PAYSTACK_TEST_KEY') ?? '');
// const paystack = new Paystack(
//   env('NEXT_PAYSTACK_TEST_KEY') ?? 'sk_test_be0b3cb028d5ea5cdf6aa15c2a60a9c9b453dba0',
// );

export { paystack };

interface PaystackResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    reference: string;
  } | null;
}

export async function initializeTransaction(options: {
  email: string;
  amount: number;
  plan?: string;
  callback_url?: string;
  metadata?: Record<string, unknown>;
}): Promise<PaystackResponse> {
  return paystack.transaction.initialize({
    ...options,
    amount: options.amount.toString(),
  });
}

export async function verifyTransaction(reference: string) {
  return paystack.transaction.verify(reference);
}
export async function disableSubscription(subscriptionCode: string) {
  return paystack.subscription.disable({
    code: subscriptionCode,
    token: '',
  });
}

export async function manageSubscription(subscriptionCode: string) {
  return paystack.subscription.generateSubscriptionLink(subscriptionCode);
}

export async function createTransaction(options: {
  email: string;
  amount: number;
  plan?: string;
  callback_url?: string;
  metadata?: Record<string, unknown>;
}) {
  return paystack.transaction.initialize({
    ...options,
    amount: options.amount.toString(),
  });
}
