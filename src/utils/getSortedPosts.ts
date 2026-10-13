import type { CollectionEntry } from "astro:content";
import { isBuildable, isListed } from "./postFilter";

type Post = CollectionEntry<"posts">;

/** Sorts posts by "last updated" descending. */
function byLastUpdated(a: Post, b: Post) {
  const time = (post: Post) =>
    new Date(post.data.modDatetime ?? post.data.pubDatetime).getTime();
  return time(b) - time(a);
}

/** Posts for listings: published only. */
export function getSortedPosts(posts: Post[]) {
  return posts.filter(isListed).sort(byLastUpdated);
}

/** Posts for page generation: published and unlisted. */
export function getBuildablePosts(posts: Post[]) {
  return posts.filter(isBuildable).sort(byLastUpdated);
}
