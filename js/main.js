(() => {
  "use strict";

  /* CONFIG: shared timing values for the project-frame transition. */
  const CONFIG = {
    duration: 500,
    easing: "cubic-bezier(0.65, 0, 0.35, 1)",
    touchFadeIn: 120,
    revealFade: 150,
  };

  /* constants for selectors, class names, and session storage. */
  const SELECTORS = {
    header: ".site-header",
    grid: ".project-grid",
    projectBlock: ".project-block",
    projectViewport: ".project-viewport",
    overlay: ".frame-overlay",
  };
  const CLASSES = {
    landing: "is-landing",
    returning: "is-returning",
  };
  const STORAGE_KEY = "frameReturn";
  const root = document.documentElement;
  const reducedMotionQuery = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };
  let transitionRunning = false;

  // Returns whether the visitor has asked for reduced motion.
  function prefersReducedMotion() {
    return reducedMotionQuery.matches;
  }

  // Reads the project-owned color resolved by CSS.
  function getProjectColor(element) {
    return getComputedStyle(element).getPropertyValue("--c").trim();
  }

  // Finds the homepage project blocks only when they exist.
  function getProjectBlocks() {
    return Array.from(document.querySelectorAll(SELECTORS.projectBlock));
  }

  // Creates the fixed inset overlay with the project's CSS color.
  function createOverlay(color) {
    const overlay = document.createElement("div");
    overlay.className = SELECTORS.overlay.slice(1);
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.setProperty("--overlay-c", color);
    document.body.append(overlay);
    return overlay;
  }

  // Removes transition elements and temporary landing state.
  function cleanTransition() {
    document.querySelectorAll(SELECTORS.overlay).forEach((overlay) => overlay.remove());
    document.querySelectorAll("." + CLASSES.landing).forEach((block) => {
      block.classList.remove(CLASSES.landing);
    });
    document.querySelectorAll(SELECTORS.grid).forEach((grid) => {
      grid.removeAttribute("aria-busy");
    });
    root.classList.remove(CLASSES.returning);
    delete root.dataset.returning;
    transitionRunning = false;
  }

  // Reads the homepage's current project-list scroll position.
  function getHomeScrollPosition() {
    return document.querySelector(SELECTORS.projectViewport)?.scrollTop || 0;
  }

  // Restores the homepage project-list scroll position before measuring a tile.
  function restoreHomeScrollPosition(scrollTop) {
    const viewport = document.querySelector(SELECTORS.projectViewport);
    const position = Number(scrollTop);
    if (!viewport || !Number.isFinite(position)) {
      return;
    }
    viewport.scrollTop = position;
  }

  // Stores the selected project and homepage position for the return transition.
  function saveReturnState(index, project) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        index,
        project,
        scrollTop: getHomeScrollPosition(),
      }));
      return true;
    } catch {
      return false;
    }
  }

  // Takes and clears the saved project state once.
  function takeReturnState() {
    try {
      const value = sessionStorage.getItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  }

  // Produces the transform that maps the inset overlay to a project block.
  function getBlockTransform(block, overlay) {
    const blockRect = block.getBoundingClientRect();
    const frameRect = overlay.getBoundingClientRect();
    const x = blockRect.left - frameRect.left;
    const y = blockRect.top - frameRect.top;
    const scaleX = blockRect.width / frameRect.width;
    const scaleY = blockRect.height / frameRect.height;
    return "translate(" + x + "px, " + y + "px) scale(" + scaleX + ", " + scaleY + ")";
  }

  // Resolves once an animation finishes without surfacing cancellation errors.
  function finish(animation) {
    return animation.finished.catch(() => undefined);
  }

  // Starts the forward transition and navigates exactly once.
  function runOpenTransition(link, index) {
    const grid = link.closest(SELECTORS.grid);
    const color = getProjectColor(link);
    const overlay = createOverlay(color);
    const from = getBlockTransform(link, overlay);
    const isTouch = !window.matchMedia("(hover: hover)").matches;
    let navigated = false;
    let safetyTimer;

    transitionRunning = true;
    grid?.setAttribute("aria-busy", "true");
    overlay.style.willChange = "transform";

    const navigate = () => {
      if (navigated) {
        return;
      }
      navigated = true;
      window.clearTimeout(safetyTimer);
      overlay.style.willChange = "";
      window.location.assign(link.href);
    };

    if (isTouch) {
      overlay.style.opacity = "0";
    }

    const motion = overlay.animate(
      [{ transform: from }, { transform: "none" }],
      { duration: CONFIG.duration, easing: CONFIG.easing, fill: "forwards" },
    );
    const fade = isTouch
      ? overlay.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: CONFIG.touchFadeIn, easing: CONFIG.easing, fill: "forwards" },
      )
      : null;

    safetyTimer = window.setTimeout(navigate, CONFIG.duration + 400);
    Promise.all([finish(motion), fade ? finish(fade) : Promise.resolve()])
      .then(navigate);

  }

  // Intercepts eligible primary project activations for the transform transition.
  function handleProjectClick(event, link, index) {
    const modified = event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey;

    if (modified || transitionRunning || prefersReducedMotion() || !("animate" in document.createElement("div"))) {
      return;
    }

    event.preventDefault();
    if (!saveReturnState(index, link.dataset.project)) {
      window.location.assign(link.href);
      return;
    }
    runOpenTransition(link, index);
  }

  // Plays the reverse transition after returning to the homepage.
  function runReturnTransition(event) {
    const blocks = getProjectBlocks();

    if (event?.persisted) {
      cleanTransition();
    }

    if (!blocks.length) {
      return;
    }

    if (transitionRunning) {
      return;
    }

    const state = takeReturnState();
    if (!state || prefersReducedMotion()) {
      cleanTransition();
      return;
    }

    const block = blocks[state.index];
    if (!block || block.dataset.project !== state.project) {
      cleanTransition();
      return;
    }

    restoreHomeScrollPosition(state.scrollTop);
    const overlay = createOverlay(getProjectColor(block));
    const to = getBlockTransform(block, overlay);
    const isTouch = !window.matchMedia("(hover: hover)").matches;

    transitionRunning = true;
    overlay.style.willChange = "transform";
    block.classList.add(CLASSES.landing);

    window.requestAnimationFrame(() => {
      root.classList.remove(CLASSES.returning);
      delete root.dataset.returning;

      const motion = overlay.animate(
        [{ transform: "none" }, { transform: to }],
        { duration: CONFIG.duration, easing: CONFIG.easing, fill: "forwards" },
      );
      const fade = isTouch
        ? overlay.animate(
          [
            { offset: 0, opacity: 1 },
            { offset: (CONFIG.duration - CONFIG.touchFadeIn) / CONFIG.duration, opacity: 1 },
            { offset: 1, opacity: 0 },
          ],
          { duration: CONFIG.duration, easing: CONFIG.easing, fill: "forwards" },
        )
        : null;

      Promise.all([finish(motion), fade ? finish(fade) : Promise.resolve()])
        .then(() => {
          overlay.style.willChange = "";
          overlay.remove();
          transitionRunning = false;
          window.requestAnimationFrame(() => block.classList.remove(CLASSES.landing));
        });
    });
  }

  // Updates the clipping viewport's header boundary after header layout changes.
  function syncHeaderBoundary() {
    const header = document.querySelector(SELECTORS.header);
    if (!header) {
      return;
    }
    const bottom = header.getBoundingClientRect().bottom;
    root.style.setProperty("--header-bottom", bottom + "px");
  }

  // Observes header sizing without attaching an always-running resize loop.
  function observeHeaderBoundary() {
    const header = document.querySelector(SELECTORS.header);
    if (!header) {
      return;
    }
    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(() => {
        window.requestAnimationFrame(syncHeaderBoundary);
      });
      observer.observe(header);
    }
    window.addEventListener("resize", () => {
      window.requestAnimationFrame(syncHeaderBoundary);
    }, { passive: true });
    syncHeaderBoundary();
  }

  // Wires normal links while progressively enhancing eligible project activations.
  function wireProjectLinks() {
    getProjectBlocks().forEach((link, index) => {
      link.addEventListener("click", (event) => handleProjectClick(event, link, index));
    });
  }

  // Initializes shared timing values, layout measurement, and project behavior.
  function init() {
    root.style.setProperty("--reveal-fade", CONFIG.revealFade + "ms");
    observeHeaderBoundary();
    wireProjectLinks();
    runReturnTransition();
  }

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("pageshow", runReturnTransition);
})();
