import { PageHeader } from '@/components/console/kit';
import { Playground } from '@/components/playground/playground';

export default function PlaygroundPage() {
  return (
    <>
      <PageHeader
        title="Playground"
        description="Resolve, explore and simulate authorization decisions. Every call is proxied server-side through the console's backend-for-frontend — the browser never holds an access token."
      />
      <Playground />
    </>
  );
}
