import { getHighestOrganisationRoleInGroup } from '@documenso/lib/utils/organisations';
import { getCurrentSubscriptionsByOrganisationIds } from '@documenso/lib/server-only/subscription/get-current-subscriptions-by-organisation-ids';
import {
  buildTeamWhereQuery,
  extractDerivedTeamSettings,
  getHighestTeamRoleInGroup,
} from '@documenso/lib/utils/teams';
import { prisma } from '@documenso/prisma';

import { authenticatedProcedure } from '../trpc';
import type { TGetOrganisationSessionResponse } from './get-organisation-session.types';
import { ZGetOrganisationSessionResponseSchema } from './get-organisation-session.types';

/**
 * Get all the organisations and teams a user belongs to.
 */
export const getOrganisationSessionRoute = authenticatedProcedure
  .output(ZGetOrganisationSessionResponseSchema)
  .query(async ({ ctx }) => {
    return await getOrganisationSession({ userId: ctx.user.id });
  });

export const getOrganisationSession = async ({
  userId,
}: {
  userId: number;
}): Promise<TGetOrganisationSessionResponse> => {
  const organisations = await prisma.organisation.findMany({
    where: {
      members: {
        some: {
          userId,
        },
      },
    },
    include: {
      organisationClaim: true,
      organisationGlobalSettings: true,
      groups: {
        where: {
          organisationGroupMembers: {
            some: {
              organisationMember: {
                userId,
              },
            },
          },
        },
      },
      teams: {
        where: buildTeamWhereQuery({ teamId: undefined, userId }),
        include: {
          teamGlobalSettings: true,
          teamGroups: {
            where: {
              organisationGroup: {
                organisationGroupMembers: {
                  some: {
                    organisationMember: {
                      userId,
                    },
                  },
                },
              },
            },
            include: {
              organisationGroup: true,
            },
          },
        },
      },
    },
  });

  const subscriptionsByOrganisationId = await getCurrentSubscriptionsByOrganisationIds({
    organisationIds: organisations.map((organisation) => organisation.id),
  });

  return organisations.map((organisation) => {
    const { organisationGlobalSettings } = organisation;

    return {
      ...organisation,
      subscription: subscriptionsByOrganisationId[organisation.id] ?? null,
      teams: organisation.teams.map((team) => {
        const derivedSettings = extractDerivedTeamSettings(
          organisationGlobalSettings,
          team.teamGlobalSettings,
        );

        return {
          ...team,
          currentTeamRole: getHighestTeamRoleInGroup(team.teamGroups),
          preferences: {
            aiFeaturesEnabled: derivedSettings.aiFeaturesEnabled,
          },
        };
      }),
      currentOrganisationRole: getHighestOrganisationRoleInGroup(organisation.groups),
    };
  });
};
