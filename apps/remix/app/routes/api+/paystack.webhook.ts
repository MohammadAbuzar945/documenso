import { prisma } from '@documenso/prisma';
import { PLAN_DOCUMENT_QUOTAS } from '@documenso/ee/server-only/limits/constants';

export async function action({ request }: { request: Request }){
  try {
    const event = await request.json();
    console.log('Paystack webhook received event:', JSON.stringify(event));
    if (event.event === 'subscription.create' || event.event === 'invoice.update') {
      const { customer, plan, subscription_code, next_payment_date } = event.data;

    
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
                planId: plan.plan_code,
                priceId: subscription_code,
                customerId: customer.customer_code,
                status:  PAY_AS_YOU_GO_PLANS.includes(plan.plan_code) ? 'INACTIVE' : 'ACTIVE',
                periodEnd: PAY_AS_YOU_GO_PLANS.includes(plan.plan_code) ? null : next_payment_date,
              },
            });

            // Get existing credits
            const existingCredits = user.userCredits[0]?.credits ?? 0;
            // Get new plan credits
            const newPlanCredits = PLAN_DOCUMENT_QUOTAS[plan.plan_code] ?? 0;


            
            const userCredits = await prisma.userCredits.update({
              where: { id: user.userCredits[0]?.id },
              data: {
                credits: Number(existingCredits) + Number(newPlanCredits),
                expiresAt: next_payment_date,
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
      const { subscription_code } = event.data;
      console.log('Processing subscription disable:', subscription_code);
      
      try {
        const existingSubscription = await prisma.subscription.findFirst({
          where: { priceId: subscription_code }
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
      const { subscription_code } = event.data;
      console.log('Processing subscription update:', subscription_code);
      const existingSubscription = await prisma.subscription.findFirst({
        where: { priceId: subscription_code }
      });
      if (existingSubscription) {
        const subscription = await prisma.subscription.update({
          where: { id: existingSubscription.id },
          data: { status: 'INACTIVE' },
        });
      }
    }
    else if (event.event === 'invoice.payment_failed') {
      const { subscription_code } = event.data;
      console.log('Processing subscription update:', subscription_code);
      const existingSubscription = await prisma.subscription.findFirst({
        where: { priceId: subscription_code }
      });
      if (existingSubscription) {
        const subscription = await prisma.subscription.update({
          where: { id: existingSubscription.id },
          data: { status: 'INACTIVE' , periodEnd: new Date() },
        });
      }
    }
    else if (event.event === 'charge.success') {
      const { customer, metadata } = event.data;
      const customerEmail = customer.email;
      
      // Extract referral code from referrer URL
      const refferCredits = metadata.value as number;
     

      console.log('Charge success details:', {
        customerEmail,
        refferCredits
        
      });

      const user = await prisma.user.findUnique({
        where: { email: customerEmail },
        include: {
          userCredits: {
            where: { isActive: true },
            orderBy: { lastUpdatedAt: 'desc' },
            take: 1
          }
        }
      });

      if (user) {
        const existingCredits = user.userCredits[0]?.credits ?? 0;
        const newPlanCredits = refferCredits ?? 0;

        await prisma.userCredits.update({
          where: { id: user.userCredits[0]?.id },
          data: {
            credits: Number(existingCredits) + Number(newPlanCredits),
          },
        });
      }
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    console.error('Paystack webhook error:', error);
    return new Response(JSON.stringify({ success: false, error: 'Invalid webhook' }), { status: 400 });
  }
} 