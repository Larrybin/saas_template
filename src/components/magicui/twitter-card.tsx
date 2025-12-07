import { Suspense } from "react";
import { type TweetProps } from "react-tweet";
import { getTweet } from "react-tweet/api";

import {
	MagicTweet,
	TweetNotFound,
	TweetSkeleton,
} from "@/components/magicui/twitter-card-ui";

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
					// eslint-disable-next-line no-console
					console.error("Failed to fetch tweet", err);
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
