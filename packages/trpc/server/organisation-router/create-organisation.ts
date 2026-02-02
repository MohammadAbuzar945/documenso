import { OrganisationType, Role } from '@prisma/client';

import type { SessionUser } from '@documenso/auth/server/lib/session/session';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { createOrganisation } from '@documenso/lib/server-only/organisation/create-organisation';
import { INTERNAL_CLAIM_ID, internalClaims } from '@documenso/lib/types/subscription';
import { isAdmin } from '@documenso/lib/utils/is-admin';
import { prisma } from '@documenso/prisma';

import { authenticatedProcedure } from '../trpc';
import {
  ZCreateOrganisationRequestSchema,
  ZCreateOrganisationResponseSchema,
} from './create-organisation.types';

export const createOrganisationRoute = authenticatedProcedure
  // .meta(createOrganisationMeta)
  .input(ZCreateOrganisationRequestSchema)
  .output(ZCreateOrganisationResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { name } = input;

    ctx.logger.info({
      input: {
        name,
      },
    });

    // Prevent non-admin users from creating additional organisations (only allow personal).
    // Only session users have roles, API token users don't have roles so they can't be admins
    const roles = ctx.session && 'roles' in ctx.user ? (ctx.user.roles as Role[]) : null;
    const isUserAdmin = roles ? isAdmin({ roles }) : false;
    
    if (!isUserAdmin) {
      const userOrganisations = await prisma.organisation.findMany({
        where: {
          ownerUserId: ctx.user.id,
        },
      });

      // Check if user already has a personal organisation
      const hasPersonalOrganisation = userOrganisations.some(
        (org) => org.type === OrganisationType.PERSONAL,
      );

      if (hasPersonalOrganisation || userOrganisations.length >= 1) {
        throw new AppError(AppErrorCode.LIMIT_EXCEEDED, {
          message: 'You can only have one personal organisation. Only administrators can create additional organisations.',
        });
      }
    }

    await createOrganisation({
      userId: ctx.user.id,
      name,
      type: OrganisationType.ORGANISATION,
      claim: internalClaims[INTERNAL_CLAIM_ID.FREE],
    });

    return {
      paymentRequired: false,
    };
  });
