import {
  defineConfig,
  envField,
  fontProviders,
  svgoOptimizer,
} from "astro/config";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import mermaid from "astro-mermaid";
import { unified } from "@astrojs/markdown-remark";
import remarkMath from "remark-math";
import remarkToc from "remark-toc";
import remarkCollapse from "remark-collapse";
import rehypeKatex from "rehype-katex";
import rehypeCallouts from "rehype-callouts";
import {
  transformerNotationDiff,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
} from "@shikijs/transformers";
import { transformerFileName } from "./src/utils/transformers/fileName";
import config from "./astro-paper.config";

/**
 * Collects the slugs of posts with `status: unlisted`. Those pages build, but
 * they stay out of the sitemap.
 */
function unlistedPostSlugs(): Set<string> {
  const slugs = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.(md|mdx)$/.test(name) && !name.startsWith("_")) {
        const frontmatter = readFileSync(full, "utf8").split("---")[1] ?? "";
        if (/^\s*status:\s*unlisted\s*$/m.test(frontmatter)) {
          slugs.add(name.replace(/\.(md|mdx)$/, ""));
        }
      }
    }
  };
  walk("src/content/posts");
  return slugs;
}

const unlistedSlugs = unlistedPostSlugs();

function isIndexablePage(page: string) {
  return ![...unlistedSlugs].some(slug => page.endsWith(`/posts/${slug}/`));
}

export default defineConfig({
  site: config.site.url,
  integrations: [
    // Renders ```mermaid code blocks as diagrams in the browser.
    // Keep this first so it can extend the markdown processor set up below.
    mermaid({ autoTheme: true }),
    mdx(),
    sitemap({ filter: isIndexablePage }),
  ],
  i18n: {
    locales: ["en"],
    defaultLocale: "en",
    routing: {
      prefixDefaultLocale: false,
    },
  },
  markdown: {
    processor: unified({
      remarkPlugins: [
        // Inline and display math via $...$ and $$...$$
        remarkMath,
        remarkToc,
        [remarkCollapse, { test: "Table of contents" }],
      ],
      rehypePlugins: [rehypeKatex, rehypeCallouts],
    }),
    shikiConfig: {
      themes: { light: "min-light", dark: "night-owl" },
      defaultColor: false,
      wrap: false,
      transformers: [
        transformerFileName({ style: "v2", hideDot: false }),
        transformerNotationHighlight(),
        transformerNotationWordHighlight(),
        transformerNotationDiff({ matchAlgorithm: "v3" }),
      ],
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
  fonts: [
    {
      name: "Google Sans Code",
      cssVariable: "--font-google-sans-code",
      provider: fontProviders.google(),
      fallbacks: ["monospace"],
      weights: [300, 400, 500, 600, 700],
      styles: ["normal", "italic"],
      formats: ["woff", "ttf"],
    },
  ],
  env: {
    schema: {
      PUBLIC_GOOGLE_SITE_VERIFICATION: envField.string({
        access: "public",
        context: "client",
        optional: true,
      }),
    },
  },
  experimental: {
    svgOptimizer: svgoOptimizer(),
  },
});
