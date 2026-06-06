# Sum-Check Protocol (Slidev)

Interactive Slidev slides for the **sum-check protocol** on multilinear polynomials.

Includes `SumCheckSimulator.vue` (step-by-step demo) and `SumCheckExercise.vue` (chat-style exercise).

Live demo: <https://nobutakashimizu.github.io/sum-check/>

## Setup

```bash
npm install
npm run dev
```

Open <http://localhost:3030>.

## Build

```bash
npm run build
```

For a local preview with the GitHub Pages base path:

```bash
npm run build:pages
npx serve dist
```

Open <http://localhost:3000/sum-check/>.

## Deploy to GitHub Pages

This repo ships with `.github/workflows/deploy.yml`. On push to `main`, GitHub Actions builds Slidev with base path `/<repository-name>/` and publishes `dist/` to GitHub Pages.

1. Create an empty GitHub repository named `sum-check` (or rename to match your Pages URL).
2. Push this project to `main`.
3. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.
4. After the workflow completes, the site is available at `https://<user>.github.io/sum-check/`.
