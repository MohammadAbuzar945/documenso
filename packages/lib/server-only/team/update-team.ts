import { OrganisationGroupType, OrganisationMemberRole, Prisma, TeamMemberRole } from '@prisma/client';
import { z } from 'zod';

import { TEAM_MEMBER_ROLE_PERMISSIONS_MAP } from '@documenso/lib/constants/teams';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { prisma } from '@documenso/prisma';

import { TEAM_AUDIT_LOG_TYPE } from '../../types/team-audit-logs';
import type { ApiRequestMetadata } from '../../universal/extract-request-metadata';
import { createTeamAuditLogData } from '../../utils/team-audit-logs';
import { getMemberRoles } from './get-member-roles';
import { buildTeamWhereQuery } from '../../utils/teams';

export type UpdateTeamOptions = {
  userId: number;
  teamId: number;
  data: {
    name?: string;
    url?: string;
    isPrivate?: boolean;
  };
  metadata?: ApiRequestMetadata;
};

export const updateTeam = async ({
  userId,
  teamId,
  data,
  metadata,
}: UpdateTeamOptions): Promise<void> => {
  try {
    const teamWhere = buildTeamWhereQuery({
      teamId,
      userId,
      roles: TEAM_MEMBER_ROLE_PERMISSIONS_MAP['MANAGE_TEAM'],
    });

    const existingTeam = await prisma.team.findUnique({
      where: teamWhere,
      include: {
        organisation: {
          select: {
            ownerUserId: true,
          },
        },
        teamGroups: {
          include: {
            organisationGroup: {
              include: {
                organisationGroupMembers: true,
              },
            },
          },
        },
      },
    });

    if (!existingTeam) {
      throw new AppError(AppErrorCode.NOT_FOUND, {
        message: 'Team not found.',
      });
    }

    const isOrganisationOwner = existingTeam.organisation.ownerUserId === userId;

    const isPrivacyToggleRequested = data.isPrivate !== undefined;
    const isPrivacyChanged = isPrivacyToggleRequested && data.isPrivate !== existingTeam.isPrivate;

    if (isPrivacyChanged) {
      const { teamRole: currentUserTeamRole } = await getMemberRoles({
        teamId,
        reference: {
          type: 'User',
          id: userId,
        },
      });

      const isTeamAdmin = currentUserTeamRole === TeamMemberRole.ADMIN;

      if (!isOrganisationOwner && !isTeamAdmin) {
        throw new AppError(AppErrorCode.UNAUTHORIZED, {
          message: 'You are not allowed to change the team privacy.',
        });
      }

      if (!existingTeam.isPrivate && data.isPrivate === true) {
        const adminTeamGroup = existingTeam.teamGroups.find(
          (group) =>
            group.organisationGroup.type === OrganisationGroupType.INTERNAL_TEAM &&
            group.teamRole === TeamMemberRole.ADMIN,
        );

        const adminCount =
          adminTeamGroup?.organisationGroup.organisationGroupMembers.length ?? 0;
        const currentUserIsAdmin = isOrganisationOwner || currentUserTeamRole === TeamMemberRole.ADMIN;
        const hasAdminMembers = adminCount > 0 || currentUserIsAdmin;

        if (!hasAdminMembers) {
          throw new AppError(AppErrorCode.INVALID_BODY, {
            message: 'Add at least one team admin before making the team private.',
          });
        }

        const memberAccessTeamGroup = existingTeam.teamGroups.find(
          (group) =>
            group.organisationGroup.type === OrganisationGroupType.INTERNAL_ORGANISATION &&
            group.organisationGroup.organisationRole === OrganisationMemberRole.MEMBER,
        );

        if (memberAccessTeamGroup) {
          await prisma.teamGroup.delete({
            where: {
              id: memberAccessTeamGroup.id,
            },
          });
        }
      }
    }

    const organisationSuffix = existingTeam.organisationId.slice(-5);
    const organisationScopedTeamUrl =
      data.url !== undefined ? `${organisationSuffix}-${data.url}` : undefined;

    if (organisationScopedTeamUrl) {
      const foundTeamWithUrl = await prisma.team.findFirst({
        where: {
          url: organisationScopedTeamUrl,
          id: {
            not: teamId,
          },
        },
      });

      const foundOrganisationWithUrl = await prisma.organisation.findFirst({
        where: {
          url: organisationScopedTeamUrl,
        },
      });

      if (foundTeamWithUrl || foundOrganisationWithUrl) {
        throw new AppError(AppErrorCode.ALREADY_EXISTS, {
          message: 'Team URL already exists.',
        });
      }
    }

    if (data.name) {
      const existingTeamWithNameInOrganisation = await prisma.team.findFirst({
        where: {
          organisationId: existingTeam.organisationId,
          name: data.name,
          id: {
            not: teamId,
          },
        },
      });

      if (existingTeamWithNameInOrganisation) {
        throw new AppError(AppErrorCode.ALREADY_EXISTS, {
          message: 'Team name already exists in this organisation.',
        });
      }
    }

    await prisma.team.update({
      where: teamWhere,
      data: {
        url: organisationScopedTeamUrl,
        name: data.name,
        isPrivate: data.isPrivate,
      },
    });

    if (isPrivacyChanged) {
      await (prisma as any).teamAuditLog.create({
        data: createTeamAuditLogData({
          teamId,
          type: TEAM_AUDIT_LOG_TYPE.TEAM_VISIBILITY_UPDATED,
          data: {
            previousIsPrivate: existingTeam.isPrivate,
            newIsPrivate: data.isPrivate as boolean,
          },
          user: {
            id: userId,
          },
          metadata,
        }),
      });
    }
  } catch (err) {
    console.error(err);

    if (!(err instanceof Prisma.PrismaClientKnownRequestError)) {
      throw err;
    }

    const target = z.array(z.string()).safeParse(err.meta?.target);

    if (err.code === 'P2002' && target.success && target.data.includes('url')) {
      throw new AppError(AppErrorCode.ALREADY_EXISTS, {
        message: 'Team URL already exists.',
      });
    }

    throw err;
  }
};
