import { ConsumeCreditsCard } from '@/components/devtools/consume-credits-card';
import Container from '@/components/layout/container';

export default async function TestPage() {
  return (
    <Container className="px-4 py-16">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* credits test (devtools only) */}
        <ConsumeCreditsCard />
      </div>
    </Container>
  );
}
