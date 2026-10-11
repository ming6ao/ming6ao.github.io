import { defineAstroPaperConfig } from "./src/types/config";

export default defineAstroPaperConfig({
  site: {
    // User site served at the domain root, so no base path is needed.
    url: "https://ming6ao.github.io",
    title: "ming6ao",
    description: "Writing on machine learning and the systems that run it.",
    author: "Ming Gao",
    profile: "https://github.com/ming6ao",
    ogImage: "default-og.jpg",
    lang: "en",
    timezone: "America/Los_Angeles",
    dir: "ltr",
  },
  posts: {
    perPage: 6,
    scheduledPostMargin: 15 * 60 * 1000,
  },
  features: {
    lightAndDarkMode: false,
    dynamicOgImage: true,
    showBackButton: true,
    editPost: {
      enabled: true,
      // Prefixes each post's path in the repository, e.g.
      // https://github.com/ming6ao/ming6ao.github.io/edit/main/src/content/posts/<file>
      url: "https://github.com/ming6ao/ming6ao.github.io/edit/main/",
    },
  },
  // Social profile links shown in the header.
  // Each name must match an icon in src/assets/icons/socials/.
  // Example: { name: "github", url: "https://github.com/you", linkTitle: "Source on GitHub" }
  socials: [
    {
      name: "x",
      url: "https://x.com/ming0gao",
      linkTitle: "Ming Gao on X",
    },
  ],
  shareLinks: [
    { name: "x", url: "https://x.com/intent/post?url=" },
    {
      name: "linkedin",
      url: "https://www.linkedin.com/sharing/share-offsite/?url=",
    },
  ],
});
