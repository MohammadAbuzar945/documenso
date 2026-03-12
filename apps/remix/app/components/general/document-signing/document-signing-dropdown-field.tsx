import { useEffect, useState } from 'react';

import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useRevalidator } from 'react-router';

import { DO_NOT_INVALIDATE_QUERY_ON_MUTATION } from '@documenso/lib/constants/trpc';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import type { TRecipientActionAuth } from '@documenso/lib/types/document-auth';
import { ZDropdownFieldMeta } from '@documenso/lib/types/field-meta';
import type { FieldWithSignatureAndFieldMeta } from '@documenso/prisma/types/field-with-signature-and-fieldmeta';
import { trpc } from '@documenso/trpc/react';
import type {
  TRemovedSignedFieldWithTokenMutationSchema,
  TSignFieldWithTokenMutationSchema,
} from '@documenso/trpc/server/field-router/schema';
import { cn } from '@documenso/ui/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@documenso/ui/primitives/select';
import { useToast } from '@documenso/ui/primitives/use-toast';

import { useRequiredDocumentSigningAuthContext } from './document-signing-auth-provider';
import { DocumentSigningFieldContainer } from './document-signing-field-container';
import { useDocumentSigningRecipientContext } from './document-signing-recipient-provider';

export type DocumentSigningDropdownFieldProps = {
  field: FieldWithSignatureAndFieldMeta;
  onSignField?: (value: TSignFieldWithTokenMutationSchema) => Promise<void> | void;
  onUnsignField?: (value: TRemovedSignedFieldWithTokenMutationSchema) => Promise<void> | void;
};

export const DocumentSigningDropdownField = ({
  field,
  onSignField,
  onUnsignField,
}: DocumentSigningDropdownFieldProps) => {
  const { _ } = useLingui();
  const { toast } = useToast();
  const { revalidate } = useRevalidator();

  const { recipient, isAssistantMode } = useDocumentSigningRecipientContext();

  const { executeActionAuthProcedure } = useRequiredDocumentSigningAuthContext();

  const parsedFieldMeta = ZDropdownFieldMeta.parse(field.fieldMeta);
  const isReadOnly = parsedFieldMeta?.readOnly;
  const defaultValue = parsedFieldMeta?.defaultValue;
  const [localChoice, setLocalChoice] = useState(parsedFieldMeta.defaultValue ?? '');
  const [optimisticInserted, setOptimisticInserted] = useState<boolean | null>(null);
  const [optimisticText, setOptimisticText] = useState<string | null>(null);

  const { mutateAsync: signFieldWithToken } = trpc.field.signFieldWithToken.useMutation(
    DO_NOT_INVALIDATE_QUERY_ON_MUTATION,
  );

  const { mutateAsync: removeSignedFieldWithToken } =
    trpc.field.removeSignedFieldWithToken.useMutation(DO_NOT_INVALIDATE_QUERY_ON_MUTATION);
  const shouldAutoSignField =
    (!field.inserted && localChoice) || (!field.inserted && isReadOnly && defaultValue);

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
      if (!localChoice) {
        return;
      }

      setOptimisticInserted(true);
      setOptimisticText(localChoice);

      const payload: TSignFieldWithTokenMutationSchema = {
        token: recipient.token,
        fieldId: field.id,
        value: localChoice,
        isBase64: true,
        authOptions,
      };

      if (onSignField) {
        await onSignField(payload);
      } else {
        await signFieldWithToken(payload);
      }

      setLocalChoice('');

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

  const onPreSign = () => {
    return true;
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
      } else {
        await removeSignedFieldWithToken(payload);
      }

      setLocalChoice('');

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

  const handleSelectItem = (val: string) => {
    setLocalChoice(val);
  };

  useEffect(() => {
    if (!field.inserted && localChoice) {
      void executeActionAuthProcedure({
        onReauthFormSubmit: async (authOptions) => await onSign(authOptions),
        actionTarget: field.type,
      });
    }
  }, [localChoice]);

  useEffect(() => {
    if (shouldAutoSignField) {
      void executeActionAuthProcedure({
        onReauthFormSubmit: async (authOptions) => await onSign(authOptions),
        actionTarget: field.type,
      });
    }
  }, []);

  return (
    <div className="pointer-events-none">
      <DocumentSigningFieldContainer
        field={field}
        onPreSign={onPreSign}
        onSign={onSign}
        onRemove={onRemove}
        type="Dropdown"
      >
        {!isInserted && (
          <p className="group-hover:text-primary text-foreground flex flex-col items-center justify-center duration-200">
            <Select value={localChoice} onValueChange={handleSelectItem}>
              <SelectTrigger
                className={cn(
                  'text-foreground z-10 h-full w-full border-none ring-0 focus:border-none focus:ring-0',
                )}
              >
                <SelectValue
                  className="text-[clamp(0.425rem,25cqw,0.825rem)]"
                  placeholder={`${_(msg`Select`)}`}
                />
              </SelectTrigger>
              <SelectContent className="w-full ring-0 focus:ring-0" position="popper">
                {parsedFieldMeta?.values?.map((item, index) => (
                  <SelectItem key={index} value={item.value} className="ring-0 focus:ring-0">
                    {item.value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </p>
        )}

        {isInserted && (
          <p className="text-foreground text-[clamp(0.425rem,25cqw,0.825rem)] duration-200">
            {insertedText}
          </p>
        )}
      </DocumentSigningFieldContainer>
    </div>
  );
};
