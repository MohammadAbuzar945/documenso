import { useEffect, useState } from 'react';

import { Trans } from '@lingui/react/macro';
import { Link, redirect } from 'react-router';

import { getOptionalSession } from '@documenso/auth/server/lib/utils/get-session';
import {
  IS_GOOGLE_SSO_ENABLED,
  IS_MICROSOFT_SSO_ENABLED,
  IS_OIDC_SSO_ENABLED,
  OIDC_PROVIDER_LABEL,
} from '@documenso/lib/constants/auth';
import { env } from '@documenso/lib/utils/env';
import { isValidReturnTo, normalizeReturnTo } from '@documenso/lib/utils/is-valid-return-to';

import { BrandingLogo } from '~/components/general/branding-logo';
import { SignInForm } from '~/components/forms/signin';
import { appMetaTags } from '~/utils/meta';

import type { Route } from './+types/signin';

export function meta() {
  return appMetaTags('Sign In');
}

export async function loader({ request }: Route.LoaderArgs) {
  const { isAuthenticated } = await getOptionalSession(request);

  // SSR env variables.
  const isGoogleSSOEnabled = IS_GOOGLE_SSO_ENABLED;
  const isMicrosoftSSOEnabled = IS_MICROSOFT_SSO_ENABLED;
  const isOIDCSSOEnabled = IS_OIDC_SSO_ENABLED;
  const oidcProviderLabel = OIDC_PROVIDER_LABEL;

  let returnTo = new URL(request.url).searchParams.get('returnTo') ?? undefined;

  returnTo = isValidReturnTo(returnTo) ? normalizeReturnTo(returnTo) : undefined;

  if (isAuthenticated) {
    throw redirect(returnTo || '/');
  }

  return {
    isGoogleSSOEnabled,
    isMicrosoftSSOEnabled,
    isOIDCSSOEnabled,
    oidcProviderLabel,
    returnTo,
  };
}

export default function SignIn({ loaderData }: Route.ComponentProps) {
  const {
    isGoogleSSOEnabled,
    isMicrosoftSSOEnabled,
    isOIDCSSOEnabled,
    oidcProviderLabel,
    returnTo,
  } = loaderData;

  const [isEmbeddedRedirect, setIsEmbeddedRedirect] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.slice(1);

    const params = new URLSearchParams(hash);

    setIsEmbeddedRedirect(params.get('embedded') === 'true');
  }, []);

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-b from-background via-background to-muted px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="border-border bg-background/90 dark:bg-background z-10 rounded-2xl border p-8 shadow-sm backdrop-blur">
          <div className="flex flex-col items-center text-center">
            <BrandingLogo className="mb-4 h-10 w-auto" />

            <h1 className="text-2xl font-semibold tracking-tight">
              <Trans>Sign in to your account</Trans>
            </h1>

            <p className="text-muted-foreground mt-2 text-sm">
              <Trans>Welcome back, we are lucky to have you.</Trans>
            </p>
          </div>

          <div className="mt-6">
            <SignInForm
              isGoogleSSOEnabled={isGoogleSSOEnabled}
              isMicrosoftSSOEnabled={isMicrosoftSSOEnabled}
              isOIDCSSOEnabled={isOIDCSSOEnabled}
              oidcProviderLabel={oidcProviderLabel}
              returnTo={returnTo}
            />
          </div>

          {!isEmbeddedRedirect && env('NEXT_PUBLIC_DISABLE_SIGNUP') !== 'true' && (
            <p className="text-muted-foreground mt-8 text-center text-sm">
              <Trans>
                Don't have an account?{' '}
                <Link
                  to={returnTo ? `/signup?returnTo=${encodeURIComponent(returnTo)}` : '/signup'}
                  className="text-documenso-700 duration-200 hover:opacity-70"
                >
                  Sign up
                </Link>
              </Trans>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
