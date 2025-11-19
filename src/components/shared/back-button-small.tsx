"use client";

import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LocaleLink, useLocaleRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

interface BackButtonSmallProps {
	href?: string;
	className?: string;
}

export default function BackButtonSmall({
	href,
	className,
}: BackButtonSmallProps) {
	const router = useLocaleRouter();

	const handleBack = () => {
		router.back();
	};

	return (
		<Button
			size="sm"
			variant="outline"
			className={cn("size-8 px-0", className)}
			asChild
		>
			{/* if href is provided, use it, otherwise use the router.back() */}
			<LocaleLink href={href || "#"} onClick={handleBack}>
				<ArrowLeftIcon className="size-4" />
			</LocaleLink>
		</Button>
	);
}
