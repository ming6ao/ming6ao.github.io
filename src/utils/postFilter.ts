import type { CollectionEntry } from "astro:content";
import config from "@/config";

type Post = CollectionEntry<"posts">;

/**
 * A post is due when its publish time has passed. In dev, treat every post as
 * due so that authoring is easy.
 */
function isDue({ data }: Post) {
  if (import.meta.env.DEV) {
    return true;
  }
  return (
    Date.now() >
    new Date(data.pubDatetime).getTime() - config.posts.scheduledPostMargin
  );
}

/** A page is built for every published or unlisted post that is due. */
export function isBuildable(post: Post) {
  return post.data.status !== "draft" && isDue(post);
}

/** Only published posts appear in listings, the feed, and the sitemap. */
export function isListed(post: Post) {
  return post.data.status === "published" && isDue(post);
}
