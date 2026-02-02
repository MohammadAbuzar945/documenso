import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';

import { useSession } from '@documenso/lib/client-only/providers/session';
import { isAdmin } from '@documenso/lib/utils/is-admin';
import { OrganisationType } from '@documenso/prisma/generated/types';

import { OrganisationCreateDialog } from '~/components/dialogs/organisation-create-dialog';
import { OrganisationInvitations } from '~/components/general/organisations/organisation-invitations';
import { SettingsHeader } from '~/components/general/settings-header';
import { UserOrganisationsTable } from '~/components/tables/user-organisations-table';

export default function TeamsSettingsPage() {
  const { _ } = useLingui();

  const { user, organisations } = useSession();
  const isUserAdmin = isAdmin(user);

  const ownedOrganisationsCount = organisations.filter((org) => org.ownerUserId === user.id).length;
  const hasPersonalOrganisation = organisations.some(
    (org) => org.ownerUserId === user.id && org.type === OrganisationType.PERSONAL,
  );
  const canCreateOrganisation = isUserAdmin && (!hasPersonalOrganisation || ownedOrganisationsCount < 2);

  return (
    <div>
      <SettingsHeader
        title={_(msg`Organisations`)}
        subtitle={_(msg`Manage all organisations you are currently associated with.`)}
      >
        {canCreateOrganisation && <OrganisationCreateDialog />}
      </SettingsHeader>

      <UserOrganisationsTable />

      <div className="mt-8 space-y-8">
        <OrganisationInvitations />
      </div>
    </div>
  );
}
