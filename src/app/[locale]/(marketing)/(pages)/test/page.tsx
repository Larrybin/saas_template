import Container from '@/components/layout/container';
import { ConsumeCreditsCard } from '@/components/test/consume-credits-card';

export default async function TestPage() {
  return (
    <Container className="py-16 px-4">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* credits test */}
        <ConsumeCreditsCard />
      </div>
    </Container>
  );
}
