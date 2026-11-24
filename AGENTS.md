# Repository rules

## Stack

- Use plain HTML, CSS, and JavaScript only.
- Keep one shared stylesheet at `css/styles.css` and one shared script at `js/main.js`.
- Keep HTML pages flat in the project root and use relative paths only; never use a leading `/`. CSS `url()` paths are relative to the CSS file.
- Do not add libraries or dependencies without approval, make external requests, or use anything but self-hosted fonts.

## Process

- State a short plan before making changes.
- At the end, list changed files, their sizes, and anything unverified.
- Do not add unrequested features, sections, or content.
- Read `SITE-RULES.md` before design or content changes.

## Code quality

- Organize CSS into commented sections: tokens, base, layout, header and name, project grid and blocks, project frame, transition, states, reduced motion, and media queries.
- Put every color, size, duration, and spacing value in a CSS variable or `CONFIG` entry. Avoid magic numbers, dead code, unused CSS, and inline styles; use semantic HTML and identical `<head>` ordering on every page.
- Write JavaScript as one IIFE with `"use strict"`; organize it into CONFIG, selector/class/storage constants, small single-purpose functions, event wiring, and init.
- Use guard clauses and feature detection; give every function a one-line comment; read layout before writing styles; use no globals or console output.

## Performance

- Keep the homepage below 300 KB total, case-study pages below 600 KB, JS below 20 KB, and CSS below 30 KB; ask before exceeding a budget.
- Animate only transform and opacity. The sole exception is a 150ms project-block text color transition on hover.
- Apply `will-change` only while an element actively animates. Do not run continuous animations; honor reduced motion everywhere.
- Make scroll and resize handlers passive and run them in `requestAnimationFrame`; prefer `IntersectionObserver`; never run an always-on loop.

## Viewport

- Never position or hide content with `window.innerHeight`, `100vh` math, or fixed cover strips.
- Establish bottom boundaries with containers that clip overflow and use `bottom: var(--page-pad)`.
- Where viewport height is unavoidable, pair `min-height: 100vh` with `min-height: 100svh`.

## Media

- Do not add media that was not supplied in optimized form; stop if an image exceeds 150 KB or a video exceeds 2 MB.
- Images use `<picture>` with AVIF and WebP, `srcset`, `sizes`, explicit width and height, and alt text. The first image uses `fetchpriority="high"`; others use `loading="lazy"` and `decoding="async"`.
- Videos are ambient loops only: muted, playsinline, looped, without an audio track, `preload="none"`, with a poster image; load them with `IntersectionObserver` and pause them offscreen.
- Reserve media space with `aspect-ratio` and report page transfer size after media changes.
