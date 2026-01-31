import { DocumentStatus, type EnvelopeItem } from '@prisma/client';

import { getEnvelopeItemPdfUrl } from '../utils/envelope-download';
import { downloadFile } from './download-file';

type DocumentVersion = 'original' | 'signed';

type DownloadPDFProps = {
  envelopeItem: Pick<EnvelopeItem, 'id' | 'envelopeId'>;
  token: string | undefined;

  fileName?: string;
  /**
   * Specifies which version of the document to download.
   * 'signed': Downloads the signed version (default).
   * 'original': Downloads the original version.
   */
  version?: DocumentVersion;
  /**
   * The envelope status to determine the correct filename suffix.
   * If REJECTED and version is 'signed', the filename will use '_rejected.pdf' instead of '_signed.pdf'.
   */
  envelopeStatus?: DocumentStatus;
};

export const downloadPDF = async ({
  envelopeItem,
  token,
  fileName,
  version = 'signed',
  envelopeStatus,
}: DownloadPDFProps) => {
  const downloadUrl = getEnvelopeItemPdfUrl({
    type: 'download',
    envelopeItem: envelopeItem,
    token,
    version,
  });

  const blob = await fetch(downloadUrl).then(async (res) => await res.blob());

  const baseTitle = (fileName ?? 'document').replace(/\.pdf$/, '');
  const suffix =
    version === 'signed'
      ? envelopeStatus === DocumentStatus.REJECTED
        ? '_rejected.pdf'
        : '_signed.pdf'
      : '.pdf';

  downloadFile({
    filename: `${baseTitle}${suffix}`,
    data: blob,
  });
};
