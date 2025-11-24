import { Suspense } from "react";
import { type TweetProps } from "react-tweet";
import { getTweet } from "react-tweet/api";

import { getLogger } from "@/lib/server/logger";
import {
	MagicTweet,
	TweetNotFound,
	TweetSkeleton,
} from "@/components/magicui/twitter-card-ui";

const logger = getLogger({ span: "magicui.twitter-card" });

/**
 * TweetCard (Server Side Only)
 */
export const TweetCard = async ({
	id,
	components,
	fallback = <TweetSkeleton />,
	onError,
	...props
}: TweetProps & {
	className?: string;
}) => {
	const tweet = id
		? await getTweet(id).catch((err) => {
				if (onError) {
					onError(err);
				} else {
					logger.error({ error: err }, "Failed to fetch tweet");
				}
			})
		: undefined;

	if (!tweet) {
		const NotFound = components?.TweetNotFound || TweetNotFound;
		return <NotFound {...props} />;
	}

	return (
		<Suspense fallback={fallback}>
			<MagicTweet tweet={tweet} {...props} />
		</Suspense>
	);
};

export {
	MagicTweet,
	TweetNotFound,
	TweetSkeleton,
} from "@/components/magicui/twitter-card-ui";
export { truncate } from "@/components/magicui/twitter-card-ui";
