import { defineAstroPaperConfig } from "./src/types/config";

export default defineAstroPaperConfig({
  site: {
    // User site served at the domain root, so no base path is needed.
    url: "https://ming6ao.github.io",
    title: "Ming6ao",
    description:
      "Technical writing on artificial intelligence, machine learning, and the systems that run them.",
    author: "Ming Gao",
    profile: "https://github.com/ming6ao",
    ogImage: "default-og.jpg",
    lang: "en",
    timezone: "America/Los_Angeles",
    dir: "ltr",
  },
  posts: {
    perPage: 6,
    perIndex: 6,
    scheduledPostMargin: 15 * 60 * 1000,
  },
  features: {
    lightAndDarkMode: true,
    dynamicOgImage: true,
    showArchives: true,
    showBackButton: true,
    editPost: {
      enabled: true,
      // Prefixes each post's path in the repository, e.g.
      // https://github.com/ming6ao/ming6ao.github.io/edit/main/src/content/posts/<file>
      url: "https://github.com/ming6ao/ming6ao.github.io/edit/main/",
    },
    search: "pagefind",
  },
  // Add more entries by matching an icon name in src/assets/icons/socials/.
  // Example: { name: "mail", url: "mailto:you@example.com" }
  socials: [{ name: "github", url: "https://github.com/ming6ao" }],
  shareLinks: [
    { name: "x", url: "https://x.com/intent/post?url=" },
    {
      name: "linkedin",
      url: "https://www.linkedin.com/sharing/share-offsite/?url=",
    },
  ],
});
