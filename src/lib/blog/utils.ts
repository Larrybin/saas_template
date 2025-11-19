import type { BlogType } from "@/lib/source";
import type { BlogDocEntry } from "@/types/content";

export const getBlogData = (page: BlogType): BlogDocEntry =>
	page.data as BlogDocEntry;

export const isPublishedBlogPost = (page: BlogType): boolean =>
	getBlogData(page).published !== false;
