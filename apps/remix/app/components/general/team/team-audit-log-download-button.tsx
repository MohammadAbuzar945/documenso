import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { DownloadIcon } from 'lucide-react';

import { downloadFile } from '@documenso/lib/client-only/download-file';
import { base64 } from '@documenso/lib/universal/base64';
import { trpc } from '@documenso/trpc/react';
import { cn } from '@documenso/ui/lib/utils';
import { Button } from '@documenso/ui/primitives/button';
import { useToast } from '@documenso/ui/primitives/use-toast';

export type TeamAuditLogDownloadButtonProps = {
  className?: string;
  teamId: number;
};

export const TeamAuditLogDownloadButton = ({
  className,
  teamId,
}: TeamAuditLogDownloadButtonProps) => {
  const { toast } = useToast();
  const { _ } = useLingui();

  const { mutateAsync: downloadTeamAuditLogs, isPending } =
    trpc.team.auditLog.download.useMutation();

  const onDownloadAuditLogsClick = async () => {
    try {
      const { data, teamName } = await downloadTeamAuditLogs({ teamId });

      const buffer = new Uint8Array(base64.decode(data));
      const blob = new Blob([buffer], { type: 'application/pdf' });
      
      downloadFile({
        data: blob,
        filename: `${teamName} - Team Audit Logs.pdf`,
      });
    } catch (error) {
      console.error(error);

      toast({
        title: _(msg`Something went wrong`),
        description: _(
          msg`Sorry, we were unable to download the team audit logs. Please try again later.`,
        ),
        variant: 'destructive',
      });
    }
  };

  return (
    <Button
      className={cn('w-full sm:w-auto', className)}
      loading={isPending}
      onClick={() => void onDownloadAuditLogsClick()}
    >
      {!isPending && <DownloadIcon className="mr-1.5 h-4 w-4" />}
      <Trans>Download Team Audit Logs</Trans>
    </Button>
  );
};

