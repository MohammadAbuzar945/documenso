import { useEffect, useState } from 'react';

import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { DateTime } from 'luxon';
import { useRevalidator } from 'react-router';

import {
  DEFAULT_DOCUMENT_DATE_FORMAT,
  convertToLocalSystemFormat,
} from '@documenso/lib/constants/date-formats';
import { DEFAULT_DOCUMENT_TIME_ZONE } from '@documenso/lib/constants/time-zones';
import { DO_NOT_INVALIDATE_QUERY_ON_MUTATION } from '@documenso/lib/constants/trpc';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import type { TRecipientActionAuth } from '@documenso/lib/types/document-auth';
import { ZDateFieldMeta } from '@documenso/lib/types/field-meta';
import type { FieldWithSignature } from '@documenso/prisma/types/field-with-signature';
import { trpc } from '@documenso/trpc/react';
import type {
  TRemovedSignedFieldWithTokenMutationSchema,
  TSignFieldWithTokenMutationSchema,
} from '@documenso/trpc/server/field-router/schema';
import { cn } from '@documenso/ui/lib/utils';
import { useToast } from '@documenso/ui/primitives/use-toast';

import { DocumentSigningFieldContainer } from './document-signing-field-container';
import { useDocumentSigningRecipientContext } from './document-signing-recipient-provider';

export type DocumentSigningDateFieldProps = {
  field: FieldWithSignature;
  dateFormat?: string | null;
  timezone?: string | null;
  onSignField?: (value: TSignFieldWithTokenMutationSchema) => Promise<void> | void;
  onUnsignField?: (value: TRemovedSignedFieldWithTokenMutationSchema) => Promise<void> | void;
};

export const DocumentSigningDateField = ({
  field,
  dateFormat = DEFAULT_DOCUMENT_DATE_FORMAT,
  timezone = DEFAULT_DOCUMENT_TIME_ZONE,
  onSignField,
  onUnsignField,
}: DocumentSigningDateFieldProps) => {
  const { _ } = useLingui();
  const { toast } = useToast();
  const { revalidate } = useRevalidator();

  const { recipient, isAssistantMode } = useDocumentSigningRecipientContext();

  const { mutateAsync: signFieldWithToken } = trpc.field.signFieldWithToken.useMutation(
    DO_NOT_INVALIDATE_QUERY_ON_MUTATION,
  );

  const {
    mutateAsync: removeSignedFieldWithToken,
  } = trpc.field.removeSignedFieldWithToken.useMutation(DO_NOT_INVALIDATE_QUERY_ON_MUTATION);

  const safeFieldMeta = ZDateFieldMeta.safeParse(field.fieldMeta);
  const parsedFieldMeta = safeFieldMeta.success ? safeFieldMeta.data : null;

  const [optimisticInserted, setOptimisticInserted] = useState<boolean | null>(null);
  const [optimisticCustomText, setOptimisticCustomText] = useState<string | null>(null);

  useEffect(() => {
    setOptimisticInserted(null);
    setOptimisticCustomText(null);
  }, [field.id, field.inserted, field.customText]);

  const isInserted = optimisticInserted ?? field.inserted;
  const customTextToDisplay = optimisticCustomText ?? field.customText;

  const localDateString = isInserted
    ? convertToLocalSystemFormat(customTextToDisplay, dateFormat, timezone)
    : '';
  const isDifferentTime = isInserted && localDateString !== customTextToDisplay;
  const tooltipText = _(
    msg`"${field.customText}" will appear on the document as it has a timezone of "${timezone || ''}".`,
  );

  const onSign = async (authOptions?: TRecipientActionAuth) => {
    const previousOptimisticInserted = optimisticInserted;
    const previousOptimisticCustomText = optimisticCustomText;

    try {
      const formattedCustomText = DateTime.now()
        .setZone(timezone ?? DEFAULT_DOCUMENT_TIME_ZONE)
        .toFormat(dateFormat ?? DEFAULT_DOCUMENT_DATE_FORMAT);

      setOptimisticInserted(true);
      setOptimisticCustomText(formattedCustomText);

      const payload: TSignFieldWithTokenMutationSchema = {
        token: recipient.token,
        fieldId: field.id,
        value: dateFormat ?? DEFAULT_DOCUMENT_DATE_FORMAT,
        authOptions,
      };

      if (onSignField) {
        await onSignField(payload);
        return;
      }

      await signFieldWithToken(payload);

      await revalidate();
    } catch (err) {
      setOptimisticInserted(previousOptimisticInserted);
      setOptimisticCustomText(previousOptimisticCustomText);

      const error = AppError.parseError(err);

      if (error.code === AppErrorCode.UNAUTHORIZED) {
        throw error;
      }

      console.error(err);

      toast({
        title: _(msg`Error`),
        description: isAssistantMode
          ? _(msg`An error occurred while signing as assistant.`)
          : _(msg`An error occurred while signing the document.`),
        variant: 'destructive',
      });
    }
  };

  const onRemove = async () => {
    const previousOptimisticInserted = optimisticInserted;
    const previousOptimisticCustomText = optimisticCustomText;

    try {
      const payload: TRemovedSignedFieldWithTokenMutationSchema = {
        token: recipient.token,
        fieldId: field.id,
      };

      setOptimisticInserted(false);
      setOptimisticCustomText('');

      if (onUnsignField) {
        await onUnsignField(payload);
        return;
      }

      await removeSignedFieldWithToken(payload);

      await revalidate();
    } catch (err) {
      setOptimisticInserted(previousOptimisticInserted);
      setOptimisticCustomText(previousOptimisticCustomText);

      console.error(err);

      toast({
        title: _(msg`Error`),
        description: _(msg`An error occurred while removing the field.`),
        variant: 'destructive',
      });
    }
  };

  return (
    <DocumentSigningFieldContainer
      field={field}
      onSign={onSign}
      onRemove={onRemove}
      type="Date"
      tooltipText={isDifferentTime ? tooltipText : undefined}
    >
      {!isInserted && (
        <p className="text-foreground group-hover:text-recipient-green text-[clamp(0.425rem,25cqw,0.825rem)] duration-200">
          <Trans>Date</Trans>
        </p>
      )}

      {isInserted && (
        <div className="flex h-full w-full items-center">
          <p
            className={cn(
              'text-foreground w-full whitespace-nowrap text-left text-[clamp(0.425rem,25cqw,0.825rem)] duration-200',
              {
                '!text-center': parsedFieldMeta?.textAlign === 'center',
                '!text-right': parsedFieldMeta?.textAlign === 'right',
              },
            )}
          >
            {localDateString}
          </p>
        </div>
      )}
    </DocumentSigningFieldContainer>
  );
};
