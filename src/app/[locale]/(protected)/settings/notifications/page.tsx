import { NewsletterFormCard } from '@/components/settings/notification/newsletter-form-card';

export default function NotificationPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <NewsletterFormCard />
      </div>
    </div>
  );
}
