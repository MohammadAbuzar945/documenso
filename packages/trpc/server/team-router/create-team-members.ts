import { OrganisationGroupType, TeamMemberRole } from '@prisma/client';
import { match } from 'ts-pattern';

import { TEAM_MEMBER_ROLE_PERMISSIONS_MAP } from '@documenso/lib/constants/teams';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { getMemberRoles } from '@documenso/lib/server-only/team/get-member-roles';
import { TEAM_AUDIT_LOG_TYPE } from '@documenso/lib/types/team-audit-logs';
import type { ApiRequestMetadata } from '@documenso/lib/universal/extract-request-metadata';
import { generateDatabaseId } from '@documenso/lib/universal/id';
import { buildTeamWhereQuery, isTeamRoleWithinUserHierarchy } from '@documenso/lib/utils/teams';
import { prisma } from '@documenso/prisma';

import type { CreateTeamAuditLogDataResponse } from '@documenso/lib/utils/team-audit-logs';
import { createTeamAuditLogData } from '@documenso/lib/utils/team-audit-logs';

import { authenticatedProcedure } from '../trpc';
import {
  ZCreateTeamMembersRequestSchema,
  ZCreateTeamMembersResponseSchema,
} from './create-team-members.types';

export const createTeamMembersRoute = authenticatedProcedure
  .input(ZCreateTeamMembersRequestSchema)
  .output(ZCreateTeamMembersResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { teamId, organisationMembers } = input;
    const { user } = ctx;

    ctx.logger.info({
      input: {
        teamId,
        organisationMembers,
      },
    });

    return await createTeamMembers({
      userId: user.id,
      teamId,
      membersToCreate: organisationMembers,
      metadata: ctx.metadata,
    });
  });

type CreateTeamMembersOptions = {
  userId: number;
  teamId: number;
  membersToCreate: {
    organisationMemberId: string;
    teamRole: TeamMemberRole;
  }[];
  metadata?: ApiRequestMetadata;
};

export const createTeamMembers = async ({
  userId,
  teamId,
  membersToCreate,
  metadata,
}: CreateTeamMembersOptions) => {
  const team = await prisma.team.findFirst({
    where: buildTeamWhereQuery({
      teamId,
      userId,
      roles: TEAM_MEMBER_ROLE_PERMISSIONS_MAP['MANAGE_TEAM'],
    }),
    include: {
      organisation: {
        include: {
          members: {
            select: {
              id: true,
              userId: true,
              user: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                },
              },
            },
          },
        },
      },
      teamGroups: {
        where: {
          organisationGroup: {
            type: OrganisationGroupType.INTERNAL_TEAM,
          },
        },
        include: {
          organisationGroup: true,
        },
      },
    },
  });

  if (!team) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Team not found or missing permissions',
    });
  }

  const isMembersPartOfOrganisation = membersToCreate.every((member) =>
    team.organisation.members.some(({ id }) => id === member.organisationMemberId),
  );

  if (!isMembersPartOfOrganisation) {
    throw new AppError(AppErrorCode.INVALID_BODY, {
      message: 'Some member IDs do not exist',
    });
  }

  const teamMemberGroup = team.teamGroups.find(
    (group) =>
      group.organisationGroup.type === OrganisationGroupType.INTERNAL_TEAM &&
      group.teamId === teamId &&
      group.teamRole === TeamMemberRole.MEMBER,
  );

  const teamManagerGroup = team.teamGroups.find(
    (group) =>
      group.organisationGroup.type === OrganisationGroupType.INTERNAL_TEAM &&
      group.teamId === teamId &&
      group.teamRole === TeamMemberRole.MANAGER,
  );

  const teamAdminGroup = team.teamGroups.find(
    (group) =>
      group.organisationGroup.type === OrganisationGroupType.INTERNAL_TEAM &&
      group.teamId === teamId &&
      group.teamRole === TeamMemberRole.ADMIN,
  );

  if (!teamMemberGroup || !teamManagerGroup || !teamAdminGroup) {
    console.error({
      message: 'Team groups not found.',
      teamMemberGroup: Boolean(teamMemberGroup),
      teamManagerGroup: Boolean(teamManagerGroup),
      teamAdminGroup: Boolean(teamAdminGroup),
    });

    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Team groups not found.',
    });
  }

  const { teamRole: currentUserTeamRole } = await getMemberRoles({
    teamId,
    reference: {
      type: 'User',
      id: userId,
    },
  });

  if (
    !membersToCreate.every((member) =>
      isTeamRoleWithinUserHierarchy(currentUserTeamRole, member.teamRole),
    )
  ) {
    throw new AppError(AppErrorCode.UNAUTHORIZED, {
      message: 'Cannot add a member with a role higher than your own',
    });
  }

  await prisma.organisationGroupMember.createMany({
    data: membersToCreate.map((member) => ({
      id: generateDatabaseId('group_member'),
      organisationMemberId: member.organisationMemberId,
      groupId: match(member.teamRole)
        .with(TeamMemberRole.MEMBER, () => teamMemberGroup.organisationGroupId)
        .with(TeamMemberRole.MANAGER, () => teamManagerGroup.organisationGroupId)
        .with(TeamMemberRole.ADMIN, () => teamAdminGroup.organisationGroupId)
        .exhaustive(),
    })),
  });

  const auditLogs: CreateTeamAuditLogDataResponse[] = [];

  for (const member of membersToCreate) {
    const organisationMember = team.organisation.members.find(
      ({ id }) => id === member.organisationMemberId,
    );

    if (!organisationMember || !organisationMember.user) {
      continue;
    }

    auditLogs.push(
      createTeamAuditLogData({
        teamId: team.id,
        type: TEAM_AUDIT_LOG_TYPE.TEAM_MEMBER_ADDED,
        data: {
          memberUserId: organisationMember.user.id,
          memberEmail: organisationMember.user.email,
          teamRole: member.teamRole,
          source: 'MANUAL',
        },
        user: {
          id: userId,
        },
        metadata,
      }),
    );
  }

  if (auditLogs.length > 0) {
    await (prisma as any).teamAuditLog.createMany({
      data: auditLogs,
    });
  }
};
