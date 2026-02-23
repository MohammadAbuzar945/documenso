import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { TEAM_MEMBER_ROLE_PERMISSIONS_MAP } from '@documenso/lib/constants/teams';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { prisma } from '@documenso/prisma';

import { buildTeamWhereQuery } from '../../utils/teams';

export type UpdateTeamOptions = {
  userId: number;
  teamId: number;
  data: {
    name?: string;
    url?: string;
  };
};

export const updateTeam = async ({ userId, teamId, data }: UpdateTeamOptions): Promise<void> => {
  try {
    const teamWhere = buildTeamWhereQuery({
      teamId,
      userId,
      roles: TEAM_MEMBER_ROLE_PERMISSIONS_MAP['MANAGE_TEAM'],
    });

    const existingTeam = await prisma.team.findUnique({
      where: teamWhere,
      select: {
        id: true,
        organisationId: true,
      },
    });

    if (!existingTeam) {
      throw new AppError(AppErrorCode.NOT_FOUND, {
        message: 'Team not found.',
      });
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
      },
    });
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
