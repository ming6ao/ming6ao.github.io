# ming6ao.github.io

A personal blog for technical writing on artificial intelligence, built with
[Astro](https://astro.build/) and the [Astro Paper](https://github.com/satnaing/astro-paper)
theme. Posts are written in Markdown with support for mathematics, highlighted
code, diagrams, and callouts.

Live site: <https://ming6ao.github.io>

## Quick start

```bash
npm install     # install dependencies
npm run dev     # start the dev server at http://localhost:4321
```

Write posts in `src/content/posts/`. When you are ready to publish, commit and
push to `main`; the deployment workflow builds and publishes the site.

Node.js 22.12.0 or newer is required.

## Documentation

| Document                               | Covers                                                                |
| -------------------------------------- | --------------------------------------------------------------------- |
| [Writing posts](docs/writing-posts.md) | Frontmatter, slugs, drafts, mathematics, code, diagrams, and callouts |
| [Operations](docs/operations.md)       | Local development, configuration, deployment, and maintenance         |

## Commands

| Command                | What it does                                                      |
| ---------------------- | ----------------------------------------------------------------- |
| `npm run dev`          | Start the development server with hot reload.                     |
| `npm run build`        | Type-check, build into `dist/`, and generate the search index.    |
| `npm run preview`      | Serve the production build locally.                               |
| `npm run lint`         | Run ESLint.                                                       |
| `npm run format`       | Rewrite files with Prettier.                                      |
| `npm run format:check` | Check formatting without writing, as continuous integration does. |
| `npm run sync`         | Regenerate Astro content types after changing schemas.            |

Run `npm run lint && npm run format:check && npm run build` before pushing; it
mirrors what the automated checks and the deployment do.

## Repository layout

```
.
├── .github/workflows/
│   ├── ci.yml                  # lint, format check, and build on pull requests
│   └── deploy.yml              # build and publish to GitHub Pages on push to main
├── docs/                       # documentation
├── public/                     # static files served as-is
├── src/
│   ├── content/
│   │   ├── pages/about.md      # the About page
│   │   └── posts/              # one file per article, this is where you write
│   ├── components/             # reusable interface pieces
│   ├── layouts/                # page shells
│   ├── pages/                  # routes: home, posts, tags, archives, search, feed
│   └── styles/                 # theme colors and typography
├── astro-paper.config.ts       # site title, author, social links, features
└── astro.config.ts             # build configuration and Markdown pipeline
```

## License

The theme is MIT licensed. See [LICENSE](LICENSE).
