import { z } from 'zod';

export const ZExportTeamAuditLogsCsvRequestSchema = z.object({
  teamId: z.number().min(1),
});

export const ZExportTeamAuditLogsCsvResponseSchema = z.object({
  jobId: z.string().min(1),
});

export type TExportTeamAuditLogsCsvRequest = z.infer<typeof ZExportTeamAuditLogsCsvRequestSchema>;
export type TExportTeamAuditLogsCsvResponse = z.infer<typeof ZExportTeamAuditLogsCsvResponseSchema>;

