import { useEffect, useRef, useState } from 'react';

import { Trans } from '@lingui/react/macro';
import { Link, type LoaderFunctionArgs, useLocation, useRevalidator } from 'react-router';

import { getSession } from '@documenso/auth/server/lib/utils/get-session';
import { prisma } from '@documenso/prisma';
import { useSession } from '@documenso/lib/client-only/providers/session';
import { getSubscriptionsByUserId } from '@documenso/lib/server-only/subscription/get-subscriptions-by-user-id';
import { Button } from '@documenso/ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@documenso/ui/primitives/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@documenso/ui/primitives/table';
import { useToast } from '@documenso/ui/primitives/use-toast';

import { NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';
import { appMetaTags } from '~/utils/meta';
import { superLoaderJson, useSuperLoaderData } from '~/utils/super-json-loader';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Get session user
  const { user } = await getSession(request);

  const organisation = await prisma.organisation.findFirst({
    where: {
      ownerUserId: user.id,
    },
  });

  if (!organisation) {
    return superLoaderJson({ subscriptions: [], user, organisation: null });
  }

  const subscriptions = await getSubscriptionsByUserId({ organisationId: organisation.id });

  return superLoaderJson({ subscriptions, user, organisation });
};

const payAsYouGoRedirects = {
  '20': 'https://paystack.shop/pay/testqoiw2m',
  '50': 'https://paystack.shop/pay/guc0g9s57q',
  '100': 'https://paystack.shop/pay/dfpu1arzjn',
  '200': 'https://paystack.shop/pay/c4jdb6jsv7',
  '500': 'https://paystack.shop/pay/bpbblrunck',
  '1000': 'https://paystack.shop/pay/q2shmym9rjg',
};

const plansData = {
  'Pay-as-you-go / Top-up': [
    {
      name: '20 envelopes',
      credits: 20,
      amount: 'ZAR 190',
      planCode: 'PLN_bit1oy0ayiqpkdu',
      label: 'Pay as you go',
      redirect_url: payAsYouGoRedirects[20],
    },
    {
      name: '50 envelopes',
      credits: 50,
      amount: 'ZAR 450',
      planCode: 'PLN_59961ig3ply5r3s',
      label: 'Pay as you go',
      redirect_url: payAsYouGoRedirects[50],
    },
    {
      name: '100 envelopes',
      credits: 100,
      amount: 'ZAR 850',
      planCode: 'PLN_ktbomtrjkiz73i1',
      label: 'Pay as you go',
      redirect_url: payAsYouGoRedirects[100],
    },
    {
      name: '200 envelopes',
      credits: 200,
      amount: 'ZAR 1,600',
      planCode: 'PLN_kxqcw02dow71g6c',
      label: 'Pay as you go',
      redirect_url: payAsYouGoRedirects[200],
    },
    {
      name: '500 envelopes',
      credits: 500,
      amount: 'ZAR 3,750',
      planCode: 'PLN_5nmok91ploz44u6',
      label: 'Pay as you go',
      redirect_url: payAsYouGoRedirects[500],
    },
    {
      name: '1000 envelopes',
      credits: 1000,
      amount: 'ZAR 7,000',
      planCode: 'PLN_f54sm9jv38v7r5m',
      label: 'Pay as you go',
      redirect_url: payAsYouGoRedirects[1000],
    },
  ],
  Monthly: [
    {
      name: '20 envelopes',
      credits: 20,
      amount: 'ZAR 170',
      planCode: 'PLN_4yptquhayqxdx68',
      label: 'Monthly',
    },
    {
      name: '50 envelopes',
      credits: 50,
      amount: 'ZAR 400',
      planCode: 'PLN_m0iv4x08zo10128',
      label: 'Monthly',
    },
    {
      name: '100 envelopes',
      credits: 100,
      amount: 'ZAR 750',
      planCode: 'PLN_hhfxiemem179vbl',
      label: 'Monthly',
    },
    {
      name: '200 envelopes',
      credits: 200,
      amount: 'ZAR 1,400',
      planCode: 'PLN_4lu7sf9rbtotr2n',
      label: 'Monthly',
    },
    {
      name: '500 envelopes',
      credits: 500,
      amount: 'ZAR 3,250',
      planCode: 'PLN_b3xu6wzwym77ifa',
      label: 'Monthly',
    },
    {
      name: '1000 envelopes',
      credits: 1000,
      amount: 'ZAR 6,000',
      planCode: 'PLN_sat4vs3qy4btmjj',
      label: 'Monthly',
    },
  ],
  Annual: [
    {
      name: '240 envelopes',
      credits: 240,
      amount: 'ZAR 1,700',
      planCode: 'PLN_9xcixnz5a5kh14x',
      label: 'Annually',
    },
    {
      name: '600 envelopes',
      credits: 600,
      amount: 'ZAR 4,000',
      planCode: 'PLN_aq2fdnx8jpzxnuf',
      label: 'Annually',
    },
    {
      name: '1200 envelopes',
      credits: 1200,
      amount: 'ZAR 7,500',
      planCode: 'PLN_4od24fxbpa947cw',
      label: 'Annually',
    },
    {
      name: '2400 envelopes',
      credits: 2400,
      amount: 'ZAR 14,000',
      planCode: 'PLN_lybvu4aaf5ry1jf',
      label: 'Annually',
    },
    {
      name: '6000 envelopes',
      credits: 6000,
      amount: 'ZAR 32,500',
      planCode: 'PLN_tdlrkbcuxy1w91v',
      label: 'Annually',
    },
    {
      name: '12000 envelopes',
      credits: 12000,
      amount: 'ZAR 60,000',
      planCode: 'PLN_60j0btaxtinfc7j',
      label: 'Annually',
    },
  ],
};

function PlanCard({
  title,
  plans,
  user,
  onClick,
  activePlanId,
}: {
  title: string | any;
  plans: any;
  user: any;
  onClick: any;
  activePlanId?: any;
}) {
  const [selectedPlan, setSelectedPlan] = useState(plans[0]);
  const [isPaystackLoaded, setIsPaystackLoaded] = useState(false);
  console.log('Metadata', selectedPlan.credits);
  return (
    <div className="flex w-full flex-col justify-between rounded-xl border p-4 hover:bg-purple-50 md:w-1/3">
      <div className="h-44">
        <h2 className="mb-4 text-xl font-semibold">{title}</h2>
        <h1 className="pb-3 text-sm text-gray-500">
          <Trans>Select the number of envelopes you require</Trans>
        </h1>
        <div className="mb-4 flex flex-wrap gap-2">
          {plans.map((plan: any) => (
            <button
              key={plan.name}
              onClick={() => setSelectedPlan(plan)}
              className={`rounded-2xl border px-3 py-1 text-sm shadow-md ${
                selectedPlan.name === plan.name
                  ? 'bg-primary border-teal-400 text-white'
                  : activePlanId === plan.planCode
                    ? 'animate-bounce border-teal-300 bg-gradient-to-bl from-green-500 to-blue-500 text-white'
                    : 'border-teal-200 hover:bg-blue-100'
              }`}
            >
              {plan.credits}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-muted-foreground mb-4 rounded-xl bg-purple-50 p-2 text-center text-xl font-bold">
          <strong className="text-primary text-2xl">
            {selectedPlan.credits}
            <br />{' '}
          </strong>
          <Trans>Envelopes</Trans>
        </div>

        <div className="text-muted-foreground mb-4 rounded-xl bg-purple-50 p-2 text-center text-xl font-bold">
          <Trans>Price </Trans> <br />{' '}
          <strong className="text-primary text-2xl">{selectedPlan.amount}</strong>
        </div>
      </div>
      <div className="text-primary bottom-0 w-full text-sm underline duration-200 hover:opacity-70">
        <Button
          className="w-full"
          onClick={() => {
            onClick(
              selectedPlan.label === 'Pay as you go',
              user?.email,
              selectedPlan.amount,
              selectedPlan.planCode,
              selectedPlan.credits,
            );
          }}
        >
          <Trans>Proceed with this subscription</Trans>
        </Button>
      </div>
    </div>
  );
}

export function meta() {
  return appMetaTags('Price Plans');
}

export default function PricePlansPage() {
  const { toast } = useToast();
  const { user } = useSession();
  const location = useLocation();
  const revalidator = useRevalidator();

  const { subscriptions, organisation } = useSuperLoaderData<typeof loader>();
  const currentSubscriptionData: any = subscriptions?.find((data: any) => data.status === 'ACTIVE');
  const planId = currentSubscriptionData?.planId;
  const priceId = currentSubscriptionData?.priceId;
  const trxref: any = new URLSearchParams(location.search).get('trxref');

  // State for polling
  const [isPolling, setIsPolling] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Polling logic when trxref is present
  useEffect(() => {
    if (trxref && !currentSubscriptionData) {
      setIsPolling(true);
      setPollCount(0);

      toast({
        title: 'Processing payment...',
        description: 'Please wait while we confirm your subscription.',
        variant: 'default',
      });

      intervalRef.current = setInterval(() => {
        setPollCount((prev) => {
          const newCount = prev + 1;

          if (newCount >= 20) {
            setIsPolling(false);
            toast({
              title: 'Taking longer than expected',
              description:
                'Your payment is being processed. Please refresh the page in a few minutes.',
              variant: 'destructive',
            });

            const newUrl = new URL(window.location.href);
            newUrl.searchParams.delete('trxref');
            window.history.replaceState({}, document.title, newUrl.pathname + newUrl.search);

            return newCount;
          }
          revalidator.revalidate();
          return newCount;
        });
      }, 3000);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [trxref, currentSubscriptionData, revalidator, toast]);

  useEffect(() => {
    if (trxref && currentSubscriptionData && isPolling) {
      setIsPolling(false);

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      // Show success toast
      toast({
        title: 'Subscription activated!',
        description: 'Your subscription has been successfully activated.',
        variant: 'default',
      });

      // Clean up URL by removing trxref
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('trxref');
      window.history.replaceState({}, document.title, newUrl.pathname + newUrl.search);
    }
  }, [trxref, currentSubscriptionData, isPolling, toast]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const getActiveSubscriptionDetails = (planId: string) => {
    for (const [_, plans] of Object?.entries(plansData)) {
      const matchedPlan = plans?.find((plan) => plan.planCode === planId);
      if (matchedPlan) return matchedPlan;
    }
    return null;
  };

  const activePlanDetails = getActiveSubscriptionDetails(planId);

  async function handleApiPaystack(
    isOneTime: boolean,
    email: string,
    amount: number,
    planId: string,
    metadata?: any,
    reference: null | string = '',
    callback_url: null | string = `${NEXT_PUBLIC_WEBAPP_URL()}/price-plans`,
  ) {
    if (isOneTime) {
      // console.log('Metadata', metadata);
      handleApiPaystackOneTimeTransaction(email, amount, metadata);
      return;
    }

    const response = await fetch(`${NEXT_PUBLIC_WEBAPP_URL()}/api/paystack/initialize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        //With this amount, the user will be able to pay for the plan but original amount will be used as mentioned in the plan details in paystack
        amount: 100,
        plan: planId,
        callback_url: callback_url,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.log('API ERROR', errorData?.message);
    }

    const data = await response.json();

    if (data?.error) {
      toast({
        title: 'Something went wrong',
        description: data?.error,
        variant: 'destructive',
      });
    } else {
      window.location.href = data?.authorization_url;
    }
  }

  async function handleApiPaystackOneTimeTransaction(
    email: string,
    amount: any,
    metadata: any,
  ) {
    const sanitizedAmount = amount.replace(/[^\d]/g, '');
    const response = await fetch(`${NEXT_PUBLIC_WEBAPP_URL()}/api/paystack/create-transaction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: parseInt(sanitizedAmount) * 100,
        metadata,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.log('API ERROR', errorData?.message);
    }

    const dataa = await response.json();
    const data = dataa.data;

    if (data?.error) {
      toast({
        title: 'Something went wrong',
        description: data?.error,
        variant: 'destructive',
      });
    } else {
      window.open(data?.authorization_url, '_blank');
    }
  }

  async function handleApiCancelPaystackSubscription(subscriptionCode: string) {
    const response = await fetch(
      `${NEXT_PUBLIC_WEBAPP_URL()}/api/paystack/update-subscription-link`,
      {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
        body: JSON.stringify({
          subscriptionCode,
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.log('API CANCEL SUBSCRIPTION ERROR', errorData?.message);
    }

    const data = await response.json();

    if (data?.error) {
      toast({
        title: 'Something went wrong',
        description: data?.error,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Cancellation started',
        description: 'please follow opened url to cancel your subscription',
        variant: 'default',
      });

      window.location.href = data?.link;
    }
  }

  async function handleManageCards(subscriptionCode: string) {
    const response = await fetch(
      `${NEXT_PUBLIC_WEBAPP_URL()}/api/paystack/update-subscription-link`,
      {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
        body: JSON.stringify({
          subscriptionCode,
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.log('API CANCEL SUBSCRIPTION ERROR', errorData?.message);
    }

    const data = await response.json();

    if (data?.error) {
      toast({
        title: 'Something went wrong',
        description: data?.error,
        variant: 'destructive',
      });
    } else {
      window.location.href = data?.link;
    }
  }

  if (!organisation) {
    return (
      <div className="mx-auto w-full max-w-screen-xl px-4 md:px-8">
        <h1 className="py-6 text-xl font-semibold text-gray-500">
          <Trans>Subscriptions are only available to organisation owners.</Trans>
        </h1>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-screen-xl px-4 md:px-8">
      <div className="w-full">
        {/* Loading indicator when polling */}
        {isPolling && (
          <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-center space-x-3">
              <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-blue-600"></div>
              <div>
                <p className="font-medium text-blue-800">Processing your subscription...</p>
                <p className="text-sm text-blue-600">
                  This may take a few moments. Please don't refresh the page.
                </p>
              </div>
            </div>
          </div>
        )}

        <Dialog>
          <DialogTrigger asChild className="flex w-full items-end justify-end">
            <button className="text-md cursor-pointer pb-6 text-blue-500 underline">
              <Trans>View History</Trans>
            </button>
          </DialogTrigger>
          <DialogContent className="w-full max-w-5xl p-6">
            <DialogHeader>
              <DialogTitle className="text-primary text-2xl font-bold">
                Subscription History
              </DialogTitle>
            </DialogHeader>
            <div className="mt-6 overflow-x-auto">
              <Table className="border-primary/30 w-full rounded-lg border shadow-md">
                <TableHeader className="bg-primary/10">
                  <TableRow>
                    <TableHead className="text-primary font-semibold">Name</TableHead>
                    <TableHead className="text-primary font-semibold">Price</TableHead>
                    <TableHead className="text-primary font-semibold">Credits</TableHead>
                    <TableHead className="text-primary font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscriptions?.map((sub: any, i: number) => (
                    <TableRow key={i} className="hover:bg-muted/50 transition">
                      <TableCell>
                        {getActiveSubscriptionDetails(sub.planId)?.label || (
                          <span className="italic text-gray-400">Unknown</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {getActiveSubscriptionDetails(sub.planId)?.amount || (
                          <span className="italic text-gray-400">Unknown</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {getActiveSubscriptionDetails(sub.planId)?.credits || (
                          <span className="italic text-gray-400">Unknown</span>
                        )}
                      </TableCell>
                      <TableCell>{sub.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>

        {currentSubscriptionData && (
          <div>
            <div className="flex w-full items-center justify-between">
              <h1 className="pb-6 text-xl font-semibold text-gray-500">
                <Trans>Active Subscription</Trans>
              </h1>
            </div>

            <div className="flex h-[25vh] w-full flex-col justify-between rounded-xl border border-dashed border-purple-500 bg-gradient-to-br from-blue-100 to-purple-100 p-4">
              <div>
                <h1 className="text-primary text-xl font-extrabold">
                  <Trans>{activePlanDetails?.label}</Trans>
                </h1>
                <h2 className="text-xl text-gray-500">
                  <Trans>{activePlanDetails?.name}</Trans>
                </h2>
                <h3 className="text-lg text-gray-400">
                  <Trans>{activePlanDetails?.amount}</Trans>
                </h3>
              </div>
              <div>
                {activePlanDetails?.label === 'Pay as you go' ? (
                  <h1 className="text-sm text-gray-400">
                    <Trans>*This is life time envelopes you can use on this platform</Trans>
                  </h1>
                ) : (
                  <div className="flex items-center space-x-2">
                    <Button
                      onClick={() => {
                        handleApiCancelPaystackSubscription(priceId);
                      }}
                      className=""
                    >
                      Cancel subscription
                    </Button>

                    <Button
                      onClick={() => {
                        handleManageCards(priceId);
                      }}
                      className="bg-gradient-to-br from-pink-400 to-blue-400"
                    >
                      Manage Cards
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <h1 className="py-6 text-xl font-semibold text-gray-500">
          <Trans>Please select subscription</Trans>
        </h1>

        <div className="flex flex-col gap-4 md:flex-row">
          {Object.entries(plansData).map(([interval, plans]) => (
            <PlanCard
              key={interval}
              title={interval}
              plans={plans}
              user={user}
              onClick={handleApiPaystack}
              activePlanId={activePlanDetails?.planCode}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
