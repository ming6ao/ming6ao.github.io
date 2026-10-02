# Operations

Everything needed to run, configure, publish, and maintain the site. For authoring
posts, see [Writing posts](writing-posts.md).

## Setup

Node.js 22.12.0 or newer is required, declared in the `engines` field of
`package.json`. Then:

```bash
npm install     # install dependencies
npm run dev     # start the dev server at http://localhost:4321
```

Use `npm ci` instead of `npm install` for a reproducible install that matches the
lock file exactly.

## Building and previewing

```bash
npm run build     # type-check and build into dist/
npm run preview   # serve the production build at http://localhost:4321
```

`npm run build` runs `astro check` for type checking, then `astro build`, which
writes the static site to `dist/`. That directory is ignored by Git; the site is
built during deployment.

The development server hides drafts but shows future-dated posts.

Run `npm run sync` to regenerate the Astro content types after changing a
collection schema.

## Checks

```bash
npm run lint          # ESLint
npm run format        # rewrite files with Prettier
npm run format:check  # verify formatting without writing
```

Run `npm run lint && npm run format:check && npm run build` before pushing. This
is what the automated checks and the deployment do.

Formatting is configured in `.prettierignore` as an allowlist: only `src/`,
`public/`, `docs/`, `.github/`, `.vscode/`, and the root configuration files are
formatted. Add a path to that file if you want it covered.

## Configuration

Most settings live in `astro-paper.config.ts`.

### Site

| Field                | Description                                                           |
| -------------------- | --------------------------------------------------------------------- |
| `url`                | Deployed origin, used for canonical links, the sitemap, and the feed. |
| `title`              | Site name in the header and as the default page title.                |
| `description`        | Default description for pages that do not set their own.              |
| `author`             | Default post author.                                                  |
| `profile`            | Author profile URL for structured data.                               |
| `ogImage`            | Fallback social image in `public/`. Defaults to `default-og.jpg`.     |
| `lang`, `timezone`   | Language and display timezone. Default to `en` and `UTC`.             |
| `dir`                | Text direction. Defaults to `ltr`.                                    |
| `googleVerification` | Google Search Console verification value.                             |

### Posts and features

`posts.perPage` controls how many posts appear on each page of the home page.
`posts.scheduledPostMargin` sets the window in milliseconds within which a
future-dated post becomes visible.

`features` toggles `lightAndDarkMode`, `dynamicOgImage` (a generated social image
per post), `showBackButton`, and `editPost`. The `editPost.url` value is prefixed
to each post's path to build its "Edit page" link.

### Social and share links

Both arrays reference an icon by `name`, matching a file in
`src/assets/icons/socials/`. Available icons are `github`, `x`, `linkedin`,
`mail`, and `telegram`.

```ts
socials: [{ name: "github", url: "https://github.com/ming6ao" }],
shareLinks: [{ name: "x", url: "https://x.com/intent/post?url=" }],
```

### Theme and typography

Colors are CSS custom properties in `src/styles/theme.css`, defined once for light
mode under `:root` and once for dark mode under `[data-theme="dark"]`. Change
`--accent` to restyle links and highlights, or `--background` and `--foreground`
for the base palette. The tokens are registered with Tailwind, so utilities such
as `text-accent` follow automatically.

`src/styles/typography.css` overrides the prose styles: headings, links, tables,
code blocks, and math display.

### Navigation and wording

The header holds only the site name and the theme toggle, so there is nothing to
configure there. To add a section, create the page under `src/pages/`, add a label
to `src/i18n/lang/en.ts`, and add a link in `src/components/Header.astro` beside
the theme button. All interface text, including button labels and accessibility
strings, is in that translation file.

The site deliberately has no search, tags, or archive pages. Posts are listed on
the home page, newest first, with pagination.

### Environment variables

Only variables declared in `astro.config.ts` are readable. Create a `.env` file
locally, or add the variable as a repository variable under **Settings → Secrets
and variables → Actions → Variables** for the deployed build.

| Variable                          | Purpose                                                         |
| --------------------------------- | --------------------------------------------------------------- |
| `PUBLIC_GOOGLE_SITE_VERIFICATION` | Google Search Console verification, overrides the config field. |

## Deployment

Any push to `main` starts `.github/workflows/deploy.yml`, which installs
dependencies with `npm ci`, runs `npm run build`, uploads `dist/` as a Pages
artifact, and publishes it. Publication is atomic, so readers never see a
half-written site.

`.github/workflows/ci.yml` runs on pull requests and performs the same checks
without deploying.

### One-time setup

Set **Settings → Pages → Source** to **GitHub Actions**. If it is left on
"Deploy from a branch", the deploy job fails. To publish without changing files,
use **Actions → Deploy to GitHub Pages → Run workflow**.

### Custom domain

1. Add a `CNAME` file to `public/` containing only the domain.
2. Enter the same domain under **Settings → Pages → Custom domain**.
3. Create the DNS record GitHub requests: a `CNAME` record to `ming6ao.github.io`
   for a subdomain, or `A` records for an apex domain.
4. Enable **Enforce HTTPS** once the check passes.
5. Update `site.url` in `astro-paper.config.ts` so canonical links, the sitemap,
   and the feed match the new address.

### Rollbacks

The published site reflects the latest commit on `main`. To undo a change, revert
the commit and push, which triggers a normal deployment. Re-running an older
workflow run also republishes that run's artifact, which helps when the build
itself is broken.

## Maintenance

Update dependencies in order of risk, checking the build after each step:

```bash
npm outdated        # see what is behind
npm update          # patch and minor updates
npx astro upgrade   # Astro itself, read the printed upgrade guide
```

After any update, run `npm run lint && npm run format:check && npm run build` and
open `npm run preview`. The parts most likely to break are math rendering, Mermaid
diagrams, callouts, and the code highlighting transformers. Commit `package.json`
and `package-lock.json` together so the deployment's `npm ci` stays in sync.

Node versions are declared in three places and should be raised together:
`engines` in `package.json`, and the `node-version` in both workflow files.

### Content over time

- **Revise a post.** Update the body and set `modDatetime` so the list pages
  reorder and an "Updated" label appears.
- **Retire a post.** Set `draft: true`; the file and its history remain.
- **Rename a post.** This changes its URL and breaks existing links. Prefer adding
  a redirect over renaming something already shared.

## Troubleshooting

**The dev server reports the port is in use.** Use a different port with
`npm run astro -- dev --port 4322`.

**Frontmatter changes have no effect.** Types are cached in `.astro/`. Stop the
server, run `npm run sync`, and start it again.

**The build fails on a missing image or module.** A referenced file does not
exist, or uses a path that does not resolve. The error names the file.

**`npm ci` fails with a lock file out of sync.** `package.json` and
`package-lock.json` disagree. Run `npm install`, commit the updated lock file, and
push.

**The build fails remotely but works locally.** The workflow uses Node.js 24 and a
clean checkout. Reproduce with:

```bash
rm -rf node_modules dist .astro
npm ci && npm run build
```

**A post returns 404 after publishing.** Check it is not `draft: true` and that
its `pubDatetime` is not in the future.

**The deploy job fails with a permissions error.** Confirm **Settings → Pages →
Source** is set to **GitHub Actions**.

**The live site shows old content.** Deployments take a moment to propagate and
browsers cache aggressively. Wait, hard-refresh, and confirm the run for the
intended commit succeeded under **Actions**.
