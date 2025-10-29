import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { getTranslations } from 'next-intl/server';

interface NotificationsLayoutProps {
  children: React.ReactNode;
}

export default async function NotificationsLayout({
  children,
}: NotificationsLayoutProps) {
  const t = await getTranslations('Dashboard.settings');

  const breadcrumbs = [
    {
      label: t('title'),
      isCurrentPage: false,
    },
    {
      label: t('notification.title'),
      isCurrentPage: true,
    },
  ];

  return (
    <>
      <DashboardHeader breadcrumbs={breadcrumbs} />

      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            <div className="px-4 lg:px-6 space-y-8">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">
                  {t('notification.title')}
                </h1>
                <p className="text-muted-foreground mt-2">
                  {t('notification.description')}
                </p>
              </div>

              {children}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
