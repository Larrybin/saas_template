import { Button } from '@/components/ui/button';
import { ArrowUpRightIcon } from 'lucide-react';
import Link from 'next/link';
import { QualityModeToggle } from './QualityModeToggle';

export const ImageGeneratorHeader = () => {
  return (
    <header className="mb-4">
      <div className="mx-auto flex justify-between items-center">
        <div>
          <h1 className="text-xl flex sm:text-xl sm:font-bold antialiased font-semibold">
            <span className="mr-2">🏞️</span> AI Image Generator
          </h1>
        </div>
        {/* <Link href={`${process.env.NEXT_PUBLIC_APP_URL}`} target="_blank">
          <Button size="icon" className="block sm:hidden">
            <ArrowUpRightIcon className="w-4 h-4" />
          </Button>
        </Link> */}

        {/* <QualityModeToggle onValueChange={() => {}} value="performance" /> */}
      </div>
    </header>
  );
};
