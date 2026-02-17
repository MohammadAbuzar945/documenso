import { syncMemberCountWithStripeSeatPlan } from '@documenso/ee/server-only/stripe/update-subscription-item-quantity';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { jobs } from '@documenso/lib/jobs/client';
import { getCurrentSubscriptionByOrganisationId } from '@documenso/lib/server-only/subscription/get-current-subscription-by-organisation-id';
import { validateIfSubscriptionIsRequired } from '@documenso/lib/utils/billing';
import { buildOrganisationWhereQuery } from '@documenso/lib/utils/organisations';
import { prisma } from '@documenso/prisma';
import { OrganisationMemberInviteStatus } from '@documenso/prisma/client';

import { authenticatedProcedure } from '../trpc';
import {
  ZLeaveOrganisationRequestSchema,
  ZLeaveOrganisationResponseSchema,
} from './leave-organisation.types';

export const leaveOrganisationRoute = authenticatedProcedure
  .input(ZLeaveOrganisationRequestSchema)
  .output(ZLeaveOrganisationResponseSchema)
  .mutation(async ({ ctx, input }) => {
    const { organisationId } = input;
    const userId = ctx.user.id;

    ctx.logger.info({
      input: {
        organisationId,
      },
    });

    const organisation = await prisma.organisation.findFirst({
      where: buildOrganisationWhereQuery({ organisationId, userId }),
      include: {
        organisationClaim: true,
        invites: {
          where: {
            status: OrganisationMemberInviteStatus.PENDING,
          },
          select: {
            id: true,
          },
        },
        members: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!organisation) {
      throw new AppError(AppErrorCode.NOT_FOUND);
    }

    const { organisationClaim } = organisation;

    const currentSubscription = await getCurrentSubscriptionByOrganisationId({
      organisationId: organisation.id,
    });

    const subscription = validateIfSubscriptionIsRequired(currentSubscription);

    const inviteCount = organisation.invites.length;
    const newMemberCount = organisation.members.length + inviteCount - 1;

    if (subscription) {
      await syncMemberCountWithStripeSeatPlan(subscription, organisationClaim, newMemberCount);
    }

    await prisma.organisationMember.delete({
      where: {
        userId_organisationId: {
          userId,
          organisationId,
        },
      },
    });

    await jobs.triggerJob({
      name: 'send.organisation-member-left.email',
      payload: {
        organisationId: organisation.id,
        memberUserId: userId,
      },
    });
  });
