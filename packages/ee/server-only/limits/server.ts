import { DocumentSource, EnvelopeType, SubscriptionStatus } from '@prisma/client';
import { DateTime } from 'luxon';

import { IS_BILLING_ENABLED } from '@documenso/lib/constants/app';
import { INTERNAL_CLAIM_ID } from '@documenso/lib/types/subscription';
import { prisma } from '@documenso/prisma';

import {
  FREE_PLAN_LIMITS,
  INACTIVE_PLAN_LIMITS,
  PAID_PLAN_LIMITS,
  SELFHOSTED_PLAN_LIMITS,
} from './constants';
import { ERROR_CODES } from './errors';
import type { TLimitsResponseSchema } from './schema';
import { ensureUserCredits, getUserCredits } from './user-credits';

export type GetServerLimitsOptions = {
  userId: number;
  teamId: number;
};

export const getServerLimits = async ({
  userId,
  teamId,
}: GetServerLimitsOptions): Promise<TLimitsResponseSchema> => {
  const organisation = await prisma.organisation.findFirst({
    where: {
      teams: {
        some: {
          id: teamId,
        },
      },
      members: {
        some: {
          userId,
        },
      },
    },
    include: {
      subscription: true,
      organisationClaim: true,
    },
  });

  if (!organisation) {
    throw new Error(ERROR_CODES.USER_FETCH_FAILED);
  }

  if (!organisation.organisationClaim) {
    throw new Error(ERROR_CODES.USER_FETCH_FAILED);
  }

  const subscription = organisation.subscription;
  
  // Query user credits from UserCredits table (credits column)
  // Each user gets 10 credits which determines their document quota and remaining
  let userCredits: number;
  try {
    userCredits = await getUserCredits(userId);
  } catch (err) {
    console.error('Error fetching user credits:', err);
    // Log the actual error for debugging
    if (err instanceof Error) {
      console.error('Error details:', err.message, err.stack);
      // If it's a Prisma error about table not existing, provide helpful message
      if (err.message.includes('does not exist') || err.message.includes('Unknown model')) {
        throw new Error('UserCredits table does not exist. Please run migrations: npm run prisma:migrate-dev');
      }
    }
    throw new Error(ERROR_CODES.USER_FETCH_FAILED);
  }
  
  // Get maximumEnvelopeItemCount from organisationClaim
  const maximumEnvelopeItemCount = organisation.organisationClaim.envelopeItemCount;
  
  // Validate that envelopeItemCount was successfully queried from database
  // Allow 0 as a valid value
  if (typeof maximumEnvelopeItemCount !== 'number' || isNaN(maximumEnvelopeItemCount) || maximumEnvelopeItemCount < 0) {
    console.error('Invalid envelopeItemCount value:', maximumEnvelopeItemCount);
    throw new Error(ERROR_CODES.USER_FETCH_FAILED);
  }

  // Set quota and remaining from user credits
  // Always use user credits for documents quota and remaining
  const quota = {
    documents: userCredits, // Initial credits from UserCredits table (10)
    recipients: FREE_PLAN_LIMITS.recipients,
    directTemplates: FREE_PLAN_LIMITS.directTemplates,
  };
  
  const remaining = {
    documents: Math.max(userCredits, 0), // Current remaining credits from UserCredits table
    recipients: FREE_PLAN_LIMITS.recipients,
    directTemplates: FREE_PLAN_LIMITS.directTemplates,
  };

  if (!IS_BILLING_ENABLED()) {
    return {
      quota: {
        ...quota,
        recipients: SELFHOSTED_PLAN_LIMITS.recipients,
        directTemplates: SELFHOSTED_PLAN_LIMITS.directTemplates,
      },
      remaining: {
        ...remaining,
        recipients: SELFHOSTED_PLAN_LIMITS.recipients,
        directTemplates: SELFHOSTED_PLAN_LIMITS.directTemplates,
      },
      maximumEnvelopeItemCount,
    };
  }

  // Bypass all limits even if plan expired for ENTERPRISE.
  if (organisation.organisationClaimId === INTERNAL_CLAIM_ID.ENTERPRISE) {
    return {
      quota: {
        ...quota,
        recipients: PAID_PLAN_LIMITS.recipients,
        directTemplates: PAID_PLAN_LIMITS.directTemplates,
      },
      remaining: {
        ...remaining,
        recipients: PAID_PLAN_LIMITS.recipients,
        directTemplates: PAID_PLAN_LIMITS.directTemplates,
      },
      maximumEnvelopeItemCount,
    };
  }

  // Early return for users with an expired subscription.
  if (subscription && subscription.status === SubscriptionStatus.INACTIVE) {
    return {
      quota: {
        ...quota,
        recipients: INACTIVE_PLAN_LIMITS.recipients,
        directTemplates: INACTIVE_PLAN_LIMITS.directTemplates,
      },
      remaining: {
        ...remaining,
        recipients: INACTIVE_PLAN_LIMITS.recipients,
        directTemplates: INACTIVE_PLAN_LIMITS.directTemplates,
      },
      maximumEnvelopeItemCount,
    };
  }

  // Allow unlimited documents for users with an unlimited documents claim.
  // This also allows "free" claim users without subscriptions if they have this flag.
  if (organisation.organisationClaim.flags.unlimitedDocuments) {
    return {
      quota: {
        ...quota,
        recipients: PAID_PLAN_LIMITS.recipients,
        directTemplates: PAID_PLAN_LIMITS.directTemplates,
      },
      remaining: {
        ...remaining,
        recipients: PAID_PLAN_LIMITS.recipients,
        directTemplates: PAID_PLAN_LIMITS.directTemplates,
      },
      maximumEnvelopeItemCount,
    };
  }

  // Still count direct templates the old way for now
  const directTemplates = await prisma.envelope.count({
    where: {
      type: EnvelopeType.TEMPLATE,
      team: {
        organisationId: organisation.id,
      },
      directLink: {
        isNot: null,
      },
    },
  });

  remaining.directTemplates = Math.max(remaining.directTemplates - directTemplates, 0);

  // Ensure quota and remaining documents are always set from user credits
  quota.documents = userCredits;
  remaining.documents = Math.max(userCredits, 0);

  return {
    quota,
    remaining,
    maximumEnvelopeItemCount,
  };
};
