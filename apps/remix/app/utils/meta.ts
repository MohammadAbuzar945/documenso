import { NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';
import { env } from '@documenso/lib/utils/env';

export const appMetaTags = (title?: string) => {
  const description =
    'Streamline your document signing with Nomia’s intuitive e-signature platform. Quick, easy, and secure, our solution makes e-signing effortless and affordable. Create reusable templates, manage individual or bulk signings, track document status, and send reminders—all within a seamless, integrated workflow.';

  return [
    {
      title: title ? `${title} - Nomia Signatures` : 'Nomia Signatures',
    },
    {
      name: 'description',
      content: description,
    },
    {
      name: 'keywords',
      content:
        'Nomia Signatures, e-signature platform, nomiadocs, nomia, DocuSign alternative, document signing, open signing infrastructure, open-source community, fast signing, beautiful signing, smart templates',
    },
    {
      name: 'author',
      content: 'Nomia Africa (Pty) Limited',
    },
    {
      name: 'robots',
      content: 'index, follow',
    },
    {
      property: 'og:title',
      content: 'Nomia - The e-signature platform',
    },
    {
      property: 'og:description',
      content: description,
    },
    {
      property: 'og:type',
      content: 'website',
    },
    {
      name: 'twitter:card',
      content: 'summary_large_image',
    },
    {
      name: 'twitter:site',
      content: '@nomicommunity',
    },
    {
      name: 'twitter:description',
      content: description,
    }
  ];
};
