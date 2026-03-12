import { useEffect, useState } from 'react';

import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { useRevalidator } from 'react-router';

import { DO_NOT_INVALIDATE_QUERY_ON_MUTATION } from '@documenso/lib/constants/trpc';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import type { TRecipientActionAuth } from '@documenso/lib/types/document-auth';
import { ZEmailFieldMeta } from '@documenso/lib/types/field-meta';
import type { FieldWithSignature } from '@documenso/prisma/types/field-with-signature';
import { trpc } from '@documenso/trpc/react';
import type {
  TRemovedSignedFieldWithTokenMutationSchema,
  TSignFieldWithTokenMutationSchema,
} from '@documenso/trpc/server/field-router/schema';
import { useToast } from '@documenso/ui/primitives/use-toast';

import { DocumentSigningFieldContainer } from './document-signing-field-container';
import {
  DocumentSigningFieldsInserted,
  DocumentSigningFieldsUninserted,
} from './document-signing-fields';
import { useRequiredDocumentSigningContext } from './document-signing-provider';
import { useDocumentSigningRecipientContext } from './document-signing-recipient-provider';

export type DocumentSigningEmailFieldProps = {
  field: FieldWithSignature;
  onSignField?: (value: TSignFieldWithTokenMutationSchema) => Promise<void> | void;
  onUnsignField?: (value: TRemovedSignedFieldWithTokenMutationSchema) => Promise<void> | void;
};

export const DocumentSigningEmailField = ({
  field,
  onSignField,
  onUnsignField,
}: DocumentSigningEmailFieldProps) => {
  const { _ } = useLingui();
  const { toast } = useToast();
  const { revalidate } = useRevalidator();

  const { email: providedEmail } = useRequiredDocumentSigningContext();

  const { recipient, targetSigner, isAssistantMode } = useDocumentSigningRecipientContext();

  const { mutateAsync: signFieldWithToken } = trpc.field.signFieldWithToken.useMutation(
    DO_NOT_INVALIDATE_QUERY_ON_MUTATION,
  );

  const { mutateAsync: removeSignedFieldWithToken } =
    trpc.field.removeSignedFieldWithToken.useMutation(DO_NOT_INVALIDATE_QUERY_ON_MUTATION);

  const safeFieldMeta = ZEmailFieldMeta.safeParse(field.fieldMeta);
  const parsedFieldMeta = safeFieldMeta.success ? safeFieldMeta.data : null;

  const [optimisticInserted, setOptimisticInserted] = useState<boolean | null>(null);
  const [optimisticText, setOptimisticText] = useState<string | null>(null);

  useEffect(() => {
    setOptimisticInserted(null);
    setOptimisticText(null);
  }, [field.id, field.inserted, field.customText]);

  const isInserted = optimisticInserted ?? field.inserted;
  const insertedText = optimisticText ?? field.customText;

  const onSign = async (authOptions?: TRecipientActionAuth) => {
    const previousOptimisticInserted = optimisticInserted;
    const previousOptimisticText = optimisticText;

    try {
      const value = providedEmail ?? '';

      setOptimisticInserted(true);
      setOptimisticText(value);

      const payload: TSignFieldWithTokenMutationSchema = {
        token: recipient.token,
        fieldId: field.id,
        value,
        isBase64: false,
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
      setOptimisticText(previousOptimisticText);

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
    const previousOptimisticText = optimisticText;

    try {
      const payload: TRemovedSignedFieldWithTokenMutationSchema = {
        token: recipient.token,
        fieldId: field.id,
      };

      setOptimisticInserted(false);
      setOptimisticText('');

      if (onUnsignField) {
        await onUnsignField(payload);
        return;
      }

      await removeSignedFieldWithToken(payload);

      await revalidate();
    } catch (err) {
      setOptimisticInserted(previousOptimisticInserted);
      setOptimisticText(previousOptimisticText);

      console.error(err);

      toast({
        title: _(msg`Error`),
        description: _(msg`An error occurred while removing the field.`),
        variant: 'destructive',
      });
    }
  };

  return (
    <DocumentSigningFieldContainer field={field} onSign={onSign} onRemove={onRemove} type="Email">
      {!isInserted && (
        <DocumentSigningFieldsUninserted>
          <Trans>Email</Trans>
        </DocumentSigningFieldsUninserted>
      )}

      {isInserted && (
        <DocumentSigningFieldsInserted textAlign={parsedFieldMeta?.textAlign}>
          {insertedText}
        </DocumentSigningFieldsInserted>
      )}
    </DocumentSigningFieldContainer>
  );
};
