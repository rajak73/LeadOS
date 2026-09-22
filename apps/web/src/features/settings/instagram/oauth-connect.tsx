import { Instagram } from 'lucide-react';
import type { InstagramStatus } from '@leados/shared';
import { useStartInstagramOAuth } from '@/api/instagram';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Disclosure } from '@/components/ui/disclosure';
import { notify } from '@/lib/toast';
import { ConnectForm } from './connect-form';
import { CopyField, WebhookValues } from './webhook-values';

/**
 * One-click connect: sign in to Instagram and come back connected. Pasting a token still works
 * and stays available below for when the sign-in can't be used.
 */
export function OAuthConnect({ status }: { status: InstagramStatus }) {
  const start = useStartInstagramOAuth();

  const connect = async () => {
    try {
      const { url } = await start.mutateAsync();
      window.location.assign(url);
    } catch (e) {
      notify.error(e, "We couldn't open Instagram. Please try again.");
    }
  };

  return (
    <Card>
      <CardHeader
        title="Connect your Instagram account"
        description="Sign in with the Instagram professional account you answer from. LeadOS asks for permission to read and reply to your messages and comments."
      />
      <CardBody className="flex flex-col gap-4">
        <div>
          <Button
            size="lg"
            icon={<Instagram aria-hidden />}
            loading={start.isPending}
            onClick={() => void connect()}
          >
            Connect with Instagram
          </Button>
        </div>
        <Disclosure
          title="Connection details"
          description="Only needed if Instagram refuses the sign-in or you change the Meta app."
        >
          <div className="flex flex-col gap-4">
            <CopyField
              label="Redirect URI"
              copyLabel="Copy redirect URI"
              value={status.oauthRedirectUri}
              help="Must be listed under the Meta app's Instagram login settings, exactly as shown."
            />
            <WebhookValues status={status} />
          </div>
        </Disclosure>
        <Disclosure
          title="Connect with a token instead"
          description="Paste a long-lived token from the Meta dashboard (Instagram → API setup → Generate token)."
        >
          <ConnectForm />
        </Disclosure>
      </CardBody>
    </Card>
  );
}
