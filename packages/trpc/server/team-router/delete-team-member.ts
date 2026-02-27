import { OrganisationGroupType, TeamMemberRole } from '@prisma/client';

import { TEAM_MEMBER_ROLE_PERMISSIONS_MAP } from '@documenso/lib/constants/teams';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { getMemberRoles } from '@documenso/lib/server-only/team/get-member-roles';
import { TEAM_AUDIT_LOG_TYPE } from '@documenso/lib/types/team-audit-logs';
import { buildTeamWhereQuery, isTeamRoleWithinUserHierarchy } from '@documenso/lib/utils/teams';
import { prisma } from '@documenso/prisma';

import { createTeamAuditLogData } from '@documenso/lib/utils/team-audit-logs';

import { authenticatedProcedure } from '../trpc';
import {
  ZDeleteTeamMemberRequestSchema,
  ZDeleteTeamMemberResponseSchema,
} from './delete-team-member.types';

export const deleteTeamMemberRoute = authenticatedProcedure
  // .meta(deleteTeamMemberMeta)
  .input(ZDeleteTeamMemberRequestSchema)
  .output(ZDeleteTeamMemberResponseSchema)
  .mutation(async ({ ctx, input }) => {
    const { teamId, memberId } = input;
    const { user } = ctx;

    ctx.logger.info({
      input: {
        teamId,
        memberId,
      },
    });

    const team = await prisma.team.findFirst({
      where: buildTeamWhereQuery({
        teamId,
        userId: user.id,
        roles: TEAM_MEMBER_ROLE_PERMISSIONS_MAP['MANAGE_TEAM'],
      }),
      include: {
        organisation: {
          select: {
            ownerUserId: true,
          },
        },
        teamGroups: {
          where: {
            organisationGroup: {
              type: OrganisationGroupType.INTERNAL_TEAM,
              organisationGroupMembers: {
                some: {
                  organisationMember: {
                    id: memberId,
                  },
                },
              },
            },
          },
          include: {
            organisationGroup: {
              include: {
                organisationGroupMembers: {
                  include: {
                    organisationMember: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!team) {
      throw new AppError(AppErrorCode.UNAUTHORIZED);
    }

    const { teamRole: currentUserTeamRole } = await getMemberRoles({
      teamId,
      reference: {
        type: 'User',
        id: user.id,
      },
    });

    const { teamRole: currentMemberToDeleteTeamRole } = await getMemberRoles({
      teamId,
      reference: {
        type: 'Member',
        id: memberId,
      },
    });

    const isOrganisationOwner = team.organisation.ownerUserId === user.id;

    const organisationMemberToDelete = team.teamGroups
      .flatMap((group) => group.organisationGroup.organisationGroupMembers)
      .find((groupMember) => groupMember.organisationMember.id === memberId)?.organisationMember;

    const isOrganisationOwnerRemovingSelfAsAdmin =
      organisationMemberToDelete?.userId === user.id;

    // Owners should not be able to remove team admins (e.g. the admin who created the team),
    // but they should be able to remove themselves from the team.
    if (
      isOrganisationOwner &&
      currentMemberToDeleteTeamRole === TeamMemberRole.ADMIN &&
      !isOrganisationOwnerRemovingSelfAsAdmin
    ) {
      throw new AppError(AppErrorCode.UNAUTHORIZED, {
        message: 'Organisation owner cannot remove team admins.',
      });
    }

    // Check role permissions.
    if (!isTeamRoleWithinUserHierarchy(currentUserTeamRole, currentMemberToDeleteTeamRole)) {
      throw new AppError(AppErrorCode.UNAUTHORIZED, {
        message: 'Cannot remove a member with a higher role',
      });
    }

    const teamGroupToRemoveMemberFrom = team.teamGroups[0];

    // Sanity check.
    // This means that the member was inherited (which means they should not be deleted directly)
    // or it means that they are not part of any team groups relating to this?
    if (team.teamGroups.length !== 1) {
      console.error('Member must have 1 one internal team group. This should not happen.');

      // Todo: Logging.
    }

    if (team.teamGroups.length === 0) {
      throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
        message: 'Team has no internal team groups',
      });
    }

    await prisma.organisationGroupMember.delete({
      where: {
        organisationMemberId_groupId: {
          organisationMemberId: memberId,
          groupId: teamGroupToRemoveMemberFrom.organisationGroupId,
        },
      },
    });

    if (organisationMemberToDelete) {
      const memberUser = await prisma.user.findUnique({
        where: {
          id: organisationMemberToDelete.userId,
        },
        select: {
          id: true,
          email: true,
          name: true,
        },
      });

      if (memberUser) {
        await prisma.teamAuditLog.create({
          data: createTeamAuditLogData({
            teamId,
            type: TEAM_AUDIT_LOG_TYPE.TEAM_MEMBER_REMOVED,
            data: {
              memberUserId: memberUser.id,
              memberEmail: memberUser.email,
              previousRole: currentMemberToDeleteTeamRole,
            },
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
            },
            metadata: ctx.metadata,
          }),
        });
      }
    }
  });
