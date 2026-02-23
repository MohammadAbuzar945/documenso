import { prisma } from '@documenso/prisma';
import { PLAN_DOCUMENT_QUOTAS } from '@documenso/ee/server-only/limits/constants';
import { ensureOrganisationCredits } from '@documenso/ee/server-only/limits/user-credits';
import { verifyTransaction } from '@documenso/lib/server-only/paystack';

/** GET requests (e.g. browser or health checks) get 405 so the route is handled instead of framework error. */
export async function loader() {
  return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function action({ request }: { request: Request }) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let event: { event?: string; data?: Record<string, unknown> };
  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      console.warn('Paystack webhook received non-JSON content-type:', contentType);
    }
    event = (await request.json()) as { event?: string; data?: Record<string, unknown> };
  } catch (parseError) {
    const message = parseError instanceof Error ? parseError.message : 'Invalid JSON';
    console.error('Paystack webhook JSON parse error:', message, parseError);
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON body', detail: message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (!event || typeof event !== 'object' || !event.event || !event.data) {
    console.error('Paystack webhook invalid payload shape:', { hasEvent: !!event?.event, hasData: !!event?.data });
    return new Response(
      JSON.stringify({ success: false, error: 'Missing event or data in payload' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    console.log('Paystack webhook received event:', JSON.stringify(event));



    if (event.event === 'subscription.create' || event.event === 'invoice.update') {
      const { customer, plan, subscription_code, next_payment_date } = event.data as {
        customer?: { email?: string; customer_code?: string };
        plan?: { plan_code?: string };
        subscription_code?: string;
        next_payment_date?: string | null;
      };
      if (!customer?.email || !plan?.plan_code) {
        console.warn('Paystack webhook: missing customer.email or plan.plan_code', event.data);
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      console.log('Extracted from event:', { email: customer.email, plan, reference: subscription_code, next_payment_date });
      // Find user by email
      const user = await prisma.user.findUnique({ 
        where: { email: customer.email },
        include: {
          userCredits: {
            where: { isActive: true },
            orderBy: { lastUpdatedAt: 'desc' },
            take: 1
          }
        }
      });
      console.log('User lookup result:', user);
    
        if (user && plan?.plan_code) {
          const organisation = await prisma.organisation.findFirst({
            where: { ownerUserId: user.id }
          });
          if (!organisation) {
            console.error('Organisation not found for user:', user.id);
            return new Response(JSON.stringify({ success: false, error: 'Organisation not found' }), { status: 400 });
          }
          try {
            const PAY_AS_YOU_GO_PLANS = [
              'PLN_f54sm9jv38v7r5m',
              'PLN_5nmok91ploz44u6', 
              'PLN_kxqcw02dow71g6c',
              'PLN_ktbomtrjkiz73i1',
              'PLN_59961ig3ply5r3s',
              'PLN_bit1oy0ayiqpkdu',
              'PLN_aiohn8rtai2dtq1',
              'PLN_9n7qj5gj3462buu',
              'PLN_y1fcc9z6et50sx3',
              'PLN_arl2oksyipcd4aq',
              'PLN_jw0og1p6hc4oz9d',
              'PLN_qcz1c2zdiyk3lw3',
            ];

            const subscription = await prisma.subscription.create({
              data: {
                organisationId: organisation.id,
                planId: subscription_code ?? '',
                priceId: plan.plan_code,
                customerId: customer.customer_code ?? '',
                status: PAY_AS_YOU_GO_PLANS.includes(plan.plan_code) ? 'INACTIVE' : 'ACTIVE',
                periodEnd: PAY_AS_YOU_GO_PLANS.includes(plan.plan_code) ? null : next_payment_date,
              },
            });

            // Ensure organisation has a credits record
            const userCreditsRecord = await ensureOrganisationCredits(organisation.id, user.id);
            
            // Get new plan credits based on plan code
            const newPlanCredits = PLAN_DOCUMENT_QUOTAS[plan.plan_code] ?? 0;

            if (newPlanCredits === 0) {
              console.warn(`Plan code ${plan.plan_code} not found in PLAN_DOCUMENT_QUOTAS. No credits will be added.`);
            }

            // Add credits to existing credits
            const userCredits = await prisma.userCredits.update({
              where: { id: userCreditsRecord.id },
              data: {
                credits: Number(userCreditsRecord.credits) + Number(newPlanCredits),
                expiresAt: next_payment_date ? new Date(next_payment_date) : null,
              },
            });

            console.log('Subscription and credits created:', { subscription, userCredits });
          } catch (subError) {
            console.error('Error creating subscription:', subError);
          }
        } else {
          console.warn('User not found or plan_code missing:', { user, plan });
        }
      
      
      
    } else if (event.event === 'subscription.disable') {
      const subscription_code = event.data?.subscription_code as string | undefined;
      console.log('Processing subscription disable:', subscription_code);

      try {
        const existingSubscription = await prisma.subscription.findFirst({
          where: { planId: subscription_code },
        });
        if (existingSubscription) {
          const subscription = await prisma.subscription.update({
            where: { id: existingSubscription.id },
            data: { status: 'INACTIVE' },
          });
          console.log('Subscription disabled:', subscription);
        }
      } catch (error) {
        console.error('Error disabling subscription:', error);
      }
    }
    else if (event.event === 'subscription.not_renew') {
      const subscription_code = event.data?.subscription_code as string | undefined;
      console.log('Processing subscription update:', subscription_code);
      const existingSubscription = await prisma.subscription.findFirst({
        where: { planId: subscription_code },
      });
      if (existingSubscription) {
        const subscription = await prisma.subscription.update({
          where: { id: existingSubscription.id },
          data: { status: 'INACTIVE' },
        });
      }
    }
    else if (event.event === 'invoice.payment_failed') {
      const subscription_code = event.data?.subscription_code as string | undefined;
      console.log('Processing subscription update:', subscription_code);
      const existingSubscription = await prisma.subscription.findFirst({
        where: { planId: subscription_code },
      });
      if (existingSubscription) {
        const subscription = await prisma.subscription.update({
          where: { id: existingSubscription.id },
          data: { status: 'INACTIVE' , periodEnd: new Date() },
        });
      }
    }
    else if (event.event === 'charge.success') {
      const { customer, metadata, plan, reference } = event.data as {
        customer?: { email?: string };
        metadata?: { value?: number; organisationId?: string };
        plan?: { plan_code?: string };
        reference?: string;
      };

      // Verify transaction via Paystack API
      if (reference) {
        try {
          const verifyResponse = await verifyTransaction(reference);
          if (verifyResponse.status) {
            console.log('Paystack transaction verified:', JSON.stringify(verifyResponse));
         let isVerified = true;
         let organisationId = metadata?.organisationId;
        
         
         
         
          }
        } catch (verifyError) {
          console.error('Paystack transaction verify failed:', reference, verifyError);
        }
      }

      const customerEmail = customer?.email;
      if (!customerEmail) {
        console.warn('Paystack webhook charge.success: missing customer.email', event.data);
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      
      // Extract referral code from referrer URL
      const refferCredits = metadata?.value as number | undefined;
      const organisationIdFromMetadata = metadata?.organisationId as string | undefined;

      const planCode = plan?.plan_code;

      //check if plan code is empty
      if (!planCode) {

        const user = await prisma.user.findUnique({
          where: { email: customerEmail },
        });

        if (!user) {
          console.error('Paystack webhook charge.success: user not found for email', customerEmail);
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }

        // Use organisationId from metadata when present, otherwise find by owner
        const organisation = organisationIdFromMetadata
          ? await prisma.organisation.findUnique({
              where: { id: organisationIdFromMetadata },
            })
          : await prisma.organisation.findFirst({
              where: { ownerUserId: user.id },
            });

        if (!organisation) {
          console.error('Organisation not found for user:', user.id);
          return new Response(JSON.stringify({ success: false, error: 'Organisation not found' }), { status: 400 });
        }

        //update organisation credits when value is present in metadata
        const userCreditsRecord = await ensureOrganisationCredits(organisation.id, user.id);
        const creditsToAdd = Number(refferCredits);

        if (userCreditsRecord && !Number.isNaN(creditsToAdd) && creditsToAdd > 0) {
          await prisma.userCredits.update({
            where: { id: userCreditsRecord.id },
            data: { credits: Number(userCreditsRecord.credits) + creditsToAdd },
          });
        }

      
        return new Response(JSON.stringify({ success: true, message: 'Credits added successfully' }), { status: 200 });
      }
      else
      {
        console.log('Plan code found:', planCode);
      }


      console.log('Charge success details:', {
        customerEmail,
        refferCredits
        
      });

      // const user = await prisma.user.findUnique({
      //   where: { email: customerEmail },
      //   include: {
      //     userCredits: {
      //       where: { isActive: true },
      //       orderBy: { lastUpdatedAt: 'desc' },
      //       take: 1
      //     }
      //   }
      // });

      // if (user) {
      //   // Ensure user has a credits record
      //   const userCreditsRecord = await ensureUserCredits(user.id);
      //   const newPlanCredits = refferCredits ?? 0;

      //   if (newPlanCredits > 0) {
      //     await prisma.userCredits.update({
      //       where: { id: userCreditsRecord.id },
      //       data: {
      //         credits: Number(userCreditsRecord.credits) + Number(newPlanCredits),
      //       },
      //     });
      //   }
      // }
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('Paystack webhook error:', message, stack ?? error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Webhook processing failed',
        detail: message,
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
} 