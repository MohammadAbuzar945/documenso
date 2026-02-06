import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import React from 'react';

import type { Field, Recipient } from '@prisma/client';

import type { TRecipientColor } from '@documenso/ui/lib/recipient-colors';
import { AVAILABLE_RECIPIENT_COLORS } from '@documenso/ui/lib/recipient-colors';

import type { TEnvelope } from '../../types/envelope';
import type { FieldRenderMode } from '../../universal/field-renderer/render-field';
import { getEnvelopeItemPdfUrl } from '../../utils/envelope-download';

type FileData =
  | {
      status: 'loading' | 'error';
    }
  | {
      /**
       * Store the original Blob instead of an ArrayBuffer/Uint8Array.
       *
       * Passing ArrayBuffers or views over them directly to react-pdf causes the
       * underlying buffer to be transferred and detached when sent to the worker.
       * If the same buffer is reused (e.g. navigating Add fields → Preview → Add fields),
       * subsequent renders will fail with DataCloneError / detached ArrayBuffer errors.
       *
       * Using a Blob keeps the source immutable and non-transferable so react-pdf
       * can safely read it on every mount without detaching our cached data.
       */
      blob: Blob;
      status: 'loaded';
    };

type EnvelopeRenderOverrideSettings = {
  mode?: FieldRenderMode;
  showRecipientTooltip?: boolean;
  showRecipientSigningStatus?: boolean;
};

type EnvelopeRenderItem = TEnvelope['envelopeItems'][number];

type EnvelopeRenderProviderValue = {
  getPdfBuffer: (envelopeItemId: string) => FileData | null;
  envelopeItems: EnvelopeRenderItem[];
  envelopeStatus: TEnvelope['status'];
  envelopeType: TEnvelope['type'];
  currentEnvelopeItem: EnvelopeRenderItem | null;
  setCurrentEnvelopeItem: (envelopeItemId: string) => void;
  fields: Field[];
  recipients: Pick<Recipient, 'id' | 'name' | 'email' | 'signingStatus'>[];
  getRecipientColorKey: (recipientId: number) => TRecipientColor;

  renderError: boolean;
  setRenderError: (renderError: boolean) => void;
  refreshEnvelopeItems: (envelopeItemIds?: string[]) => Promise<void> | void;
  overrideSettings?: EnvelopeRenderOverrideSettings;
};

interface EnvelopeRenderProviderProps {
  children: React.ReactNode;

  envelope: Pick<TEnvelope, 'envelopeItems' | 'status' | 'type'>;

  /**
   * Optional fields which are passed down to renderers for custom rendering needs.
   *
   * Only pass if the CustomRenderer you are passing in wants fields.
   */
  fields?: Field[];

  /**
   * Optional recipient used to determine the color of the fields and hover
   * previews.
   *
   * Only required for generic page renderers.
   */
  recipients?: Pick<Recipient, 'id' | 'name' | 'email' | 'signingStatus'>[];

  /**
   * The token to access the envelope.
   *
   * If not provided, it will be assumed that the current user can access the document.
   */
  token: string | undefined;

  /**
   * Custom override settings for generic page renderers.
   */
  overrideSettings?: EnvelopeRenderOverrideSettings;
}

const EnvelopeRenderContext = createContext<EnvelopeRenderProviderValue | null>(null);

export const useCurrentEnvelopeRender = () => {
  const context = useContext(EnvelopeRenderContext);

  if (!context) {
    throw new Error('useCurrentEnvelopeRender must be used within a EnvelopeRenderProvider');
  }

  return context;
};

export const useOptionalEnvelopeRender = () => {
  return useContext(EnvelopeRenderContext);
};

/**
 * Manages fetching and storing PDF files to render on the client.
 */
export const EnvelopeRenderProvider = ({
  children,
  envelope,
  fields,
  token,
  recipients = [],
  overrideSettings,
}: EnvelopeRenderProviderProps) => {
  // Indexed by documentDataId.
  const [files, setFiles] = useState<Record<string, FileData>>({});

  const [currentItem, setCurrentItem] = useState<EnvelopeRenderItem | null>(null);

  const [renderError, setRenderError] = useState<boolean>(false);

  const envelopeItems = useMemo(
    () => envelope.envelopeItems.sort((a, b) => a.order - b.order),
    [envelope.envelopeItems],
  );

  const loadEnvelopeItemPdfFile = useCallback(
    async (envelopeItem: EnvelopeRenderItem, options?: { force?: boolean }) => {
      const force = options?.force ?? false;

      if (!force && files[envelopeItem.id]?.status === 'loading') {
        return;
      }

      setFiles((prev) => ({
        ...prev,
        [envelopeItem.id]: {
          status: 'loading',
        },
      }));

      try {
        const downloadUrl = getEnvelopeItemPdfUrl({
          type: 'view',
          envelopeItem: envelopeItem,
          token,
        });

        const blob = await fetch(downloadUrl).then(async (res) => await res.blob());
        setFiles((prev) => ({
          ...prev,
          [envelopeItem.id]: {
            blob,
            status: 'loaded',
          },
        }));
      } catch (error) {
        console.error(error);

        setFiles((prev) => ({
          ...prev,
          [envelopeItem.id]: {
            status: 'error',
          },
        }));
      }
    },
    [files, token],
  );

  const getPdfBuffer = useCallback(
    (envelopeItemId: string) => {
      return files[envelopeItemId] || null;
    },
    [files],
  );

  const setCurrentEnvelopeItem = (envelopeItemId: string) => {
    const foundItem = envelope.envelopeItems.find((item) => item.id === envelopeItemId);

    setCurrentItem(foundItem ?? null);
  };

  const refreshEnvelopeItems = useCallback(
    async (envelopeItemIds?: string[]) => {
      const targetItems =
        envelopeItemIds && envelopeItemIds.length > 0
          ? envelopeItems.filter((item) => envelopeItemIds.includes(item.id))
          : envelopeItems;

      for (const item of targetItems) {
        void loadEnvelopeItemPdfFile(item, { force: true });
      }
    },
    [envelopeItems, loadEnvelopeItemPdfFile],
  );

  // Set the selected item to the first item if none is set.
  useEffect(() => {
    if (currentItem && !envelopeItems.some((item) => item.id === currentItem.id)) {
      setCurrentItem(null);
    }

    if (!currentItem && envelopeItems.length > 0) {
      setCurrentEnvelopeItem(envelopeItems[0].id);
    }
  }, [currentItem, envelopeItems]);

  // Look for any missing pdf files and load them.
  useEffect(() => {
    const missingFiles = envelope.envelopeItems.filter((item) => !files[item.id]);

    for (const item of missingFiles) {
      void loadEnvelopeItemPdfFile(item);
    }
  }, [envelope.envelopeItems]);

  const recipientIds = useMemo(
    () => recipients.map((recipient) => recipient.id).sort(),
    [recipients],
  );

  const getRecipientColorKey = useCallback(
    (recipientId: number) => {
      const recipientIndex = recipientIds.findIndex((id) => id === recipientId);

      return AVAILABLE_RECIPIENT_COLORS[
        Math.max(recipientIndex, 0) % AVAILABLE_RECIPIENT_COLORS.length
      ];
    },
    [recipientIds],
  );

  return (
    <EnvelopeRenderContext.Provider
      value={{
        getPdfBuffer,
        envelopeItems,
        envelopeStatus: envelope.status,
        envelopeType: envelope.type,
        currentEnvelopeItem: currentItem,
        setCurrentEnvelopeItem,
        fields: fields ?? [],
        recipients,
        getRecipientColorKey,
        renderError,
        setRenderError,
        refreshEnvelopeItems,
        overrideSettings,
      }}
    >
      {children}
    </EnvelopeRenderContext.Provider>
  );
};
