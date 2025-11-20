"use client";

import { DotPattern } from "@/components/magicui/dot-pattern";
import { cn } from "@/lib/utils";

export function DotPatternDemo() {
	return (
		<div className="relative flex h-[500px] w-full flex-col items-center justify-center overflow-hidden rounded-lg border bg-background">
			<DotPattern
				className={cn(
					"[mask-image:radial-gradient(300px_circle_at_center,white,transparent)]",
				)}
			/>
		</div>
	);
}
