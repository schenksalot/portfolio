const CONFIG = {
  // Project-frame travel and returning-content reveal timing in milliseconds.
  transitionDuration: 500,
  revealDuration: 150,
  // Each frame edge trails the first edge by this fraction of the transition.
  edgeStagger: { top: 0, left: 0.04, bottom: 0.08, right: 0.12 },
  // Keep transition corners square; raise this only to introduce a rounded flight path.
  cornerPeak: 0,
};

const projectLinks = Array.from(document.querySelectorAll(".project-block"));
const header = document.querySelector(".site-header");
let transitionRunning = false;
let refreshCardEdges = () => {};

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function snapToDevicePixel(value) {
  const ratio = window.devicePixelRatio || 1;
  return Math.round(value * ratio) / ratio;
}

function easeInOutQuart(value) {
  return value < 0.5
    ? 8 * value ** 4
    : 1 - ((-2 * value + 2) ** 4) / 2;
}

function getPagePadding() {
  return header
    ? Number.parseFloat(getComputedStyle(header).paddingLeft)
    : 0;
}

function getViewportFrame(pagePad = getPagePadding()) {
  return {
    top: pagePad,
    left: pagePad,
    right: document.documentElement.clientWidth - pagePad,
    bottom: document.documentElement.clientHeight - pagePad,
  };
}

function getVisibleProjectFrame(block, pagePad) {
  const rect = block.getBoundingClientRect();
  const headerBottom = header ? header.getBoundingClientRect().bottom : 0;
  const viewportBottom = document.documentElement.clientHeight - pagePad;

  return {
    top: snapToDevicePixel(Math.max(rect.top, headerBottom)),
    left: snapToDevicePixel(rect.left),
    right: snapToDevicePixel(rect.right),
    bottom: snapToDevicePixel(Math.min(rect.bottom, viewportBottom)),
  };
}

function applyFrame(overlay, frame) {
  overlay.style.top = `${frame.top}px`;
  overlay.style.left = `${frame.left}px`;
  overlay.style.width = `${frame.right - frame.left}px`;
  overlay.style.height = `${frame.bottom - frame.top}px`;
  overlay.style.borderRadius = `${frame.radius}px`;
}

function frameAt(progress, start, end) {
  const maxLag = Math.max(...Object.values(CONFIG.edgeStagger));
  const edges = {};

  Object.entries(CONFIG.edgeStagger).forEach(([edge, delay]) => {
    const localProgress = clamp((progress - delay) / (1 - maxLag), 0, 1);
    edges[edge] = snapToDevicePixel(
      start[edge] + (end[edge] - start[edge]) * easeInOutQuart(localProgress),
    );
  });

  return {
    ...edges,
    radius: progress === 0 || progress === 1
      ? 0
      : CONFIG.cornerPeak * Math.sin(Math.PI * progress),
  };
}

function createOverlay(frame) {
  const overlay = document.createElement("div");
  overlay.className = "frame-overlay";
  overlay.setAttribute("aria-hidden", "true");
  applyFrame(overlay, { ...frame, radius: 0 });
  document.body.append(overlay);
  return overlay;
}

function animateFrame(overlay, start, end, reverse, onComplete) {
  const startedAt = performance.now();

  function step(now) {
    const elapsed = clamp((now - startedAt) / CONFIG.transitionDuration, 0, 1);
    applyFrame(overlay, frameAt(reverse ? 1 - elapsed : elapsed, start, end));

    if (elapsed < 1) {
      window.requestAnimationFrame(step);
      return;
    }

    onComplete();
  }

  window.requestAnimationFrame(step);
}

function removeTransitionArtifacts() {
  document.querySelectorAll(".frame-overlay").forEach((overlay) => overlay.remove());
  document.querySelectorAll(".project-grid.is-transitioning").forEach((grid) => {
    grid.classList.remove("is-transitioning");
  });
  document.querySelectorAll(".project-block.is-landing").forEach((block) => {
    block.classList.remove("is-landing");
  });
  document.documentElement.classList.remove("is-returning");
  transitionRunning = false;
}

function saveReturnState(index) {
  try {
    sessionStorage.setItem("frameReturn", JSON.stringify({ index, scrollY: window.scrollY }));
    return true;
  } catch {
    return false;
  }
}

function consumeReturnState() {
  try {
    const stored = sessionStorage.getItem("frameReturn");
    sessionStorage.removeItem("frameReturn");
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function runReturnTransition(event) {
  if (!projectLinks.length) {
    return;
  }

  const returnState = consumeReturnState();
  if (!returnState) {
    if (event?.persisted) {
      removeTransitionArtifacts();
    }
    return;
  }

  if (Number.isFinite(Number(returnState.scrollY))) {
    window.scrollTo(0, Number(returnState.scrollY));
  }

  const block = projectLinks[returnState.index];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion || !block || transitionRunning) {
    removeTransitionArtifacts();
    return;
  }

  transitionRunning = true;
  const pagePad = getPagePadding();
  const source = getViewportFrame(pagePad);
  const target = getVisibleProjectFrame(block, pagePad);
  const overlay = document.querySelector(".frame-overlay") || createOverlay(source);

  applyFrame(overlay, { ...source, radius: 0 });
  document.documentElement.classList.remove("is-returning");
  block.classList.add("is-landing");

  animateFrame(overlay, target, source, true, () => {
    overlay.remove();
    transitionRunning = false;
    window.requestAnimationFrame(() => block.classList.remove("is-landing"));
  });
}

function setupProjectLinks() {
  projectLinks.forEach((link, index) => {
    link.addEventListener("click", (event) => {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const modifiedClick = event.button !== 0
        || event.ctrlKey
        || event.metaKey
        || event.shiftKey
        || event.altKey;

      if (modifiedClick || reducedMotion || transitionRunning || !saveReturnState(index)) {
        return;
      }

      event.preventDefault();
      transitionRunning = true;

      const pagePad = getPagePadding();
      const source = getVisibleProjectFrame(link, pagePad);
      const target = getViewportFrame(pagePad);
      const overlay = createOverlay(source);
      const grid = link.closest(".project-grid");
      grid?.classList.add("is-transitioning");

      let navigated = false;
      const navigate = () => {
        if (navigated) {
          return;
        }

        navigated = true;
        window.clearTimeout(safetyTimeout);
        overlay.style.cssText = "inset: var(--page-pad); border-radius: 0;";
        window.location.href = link.href;
      };
      const safetyTimeout = window.setTimeout(navigate, CONFIG.transitionDuration + 400);

      animateFrame(overlay, source, target, false, navigate);
    });
  });
}

function setupCardEdges() {
  if (!projectLinks.length) {
    return;
  }

  const createEdgeMask = (modifier = "") => {
    const mask = document.createElement("div");
    mask.className = `viewport-edge-mask ${modifier}`.trim();
    mask.setAttribute("aria-hidden", "true");
    document.body.append(mask);
  };
  createEdgeMask("viewport-edge-mask--top");
  createEdgeMask();
  const mobileLayout = window.matchMedia("(max-width: 700px)");
  let queued = false;
  let mobileEdgesCleared = false;
  let lastHeaderBottom = "";
  let lastBottomEdge = "";

  function setRootEdge(name, value) {
    if (value === (name === "--header-bottom" ? lastHeaderBottom : lastBottomEdge)) {
      return;
    }

    document.documentElement.style.setProperty(name, value);
    if (name === "--header-bottom") {
      lastHeaderBottom = value;
    } else {
      lastBottomEdge = value;
    }
  }

  function clearCardEdges() {
    projectLinks.forEach((block) => {
      block.classList.remove("is-top-clipped", "is-bottom-clipped");
      block.style.removeProperty("--edge-left");
      block.style.removeProperty("--edge-width");
    });
  }

  function update() {
    const pagePad = getPagePadding();
    const viewportBottom = document.documentElement.clientHeight;
    const bottomEdge = viewportBottom - pagePad;
    const pixelRatio = window.devicePixelRatio || 1;
    const threshold = 1 / pixelRatio;
    const headerBottom = header
      ? snapToDevicePixel(header.getBoundingClientRect().bottom)
      : 0;

    setRootEdge("--header-bottom", `${headerBottom}px`);
    setRootEdge("--bottom-edge", `${bottomEdge}px`);

    if (mobileLayout.matches) {
      if (!mobileEdgesCleared) {
        clearCardEdges();
        mobileEdgesCleared = true;
      }
      return;
    }

    mobileEdgesCleared = false;

    projectLinks.forEach((block) => {
      const rect = block.getBoundingClientRect();
      const intersectsTop = rect.top < headerBottom - threshold && rect.bottom > headerBottom;
      const intersectsBottom = rect.top < bottomEdge && rect.bottom > bottomEdge + threshold;
      const hasClippedEdge = intersectsTop || intersectsBottom;

      block.classList.toggle("is-top-clipped", intersectsTop);
      block.classList.toggle("is-bottom-clipped", intersectsBottom);

      if (hasClippedEdge) {
        block.style.setProperty("--edge-left", `${snapToDevicePixel(rect.left)}px`);
        block.style.setProperty("--edge-width", `${snapToDevicePixel(rect.width)}px`);
      } else {
        block.style.removeProperty("--edge-left");
        block.style.removeProperty("--edge-width");
      }
    });
  }

  function scheduleUpdate() {
    if (queued) {
      return;
    }

    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      update();
    });
  }

  refreshCardEdges = scheduleUpdate;
  window.addEventListener("scroll", () => {
    if (!mobileLayout.matches) {
      scheduleUpdate();
    }
  }, { passive: true });
  window.addEventListener("resize", scheduleUpdate);
  window.addEventListener("orientationchange", scheduleUpdate);
  mobileLayout.addEventListener("change", scheduleUpdate);
  window.visualViewport?.addEventListener("resize", scheduleUpdate);
  window.visualViewport?.addEventListener("scroll", () => {
    if (!mobileLayout.matches) {
      scheduleUpdate();
    }
  });
  update();
}

function initialize() {
  document.documentElement.style.setProperty("--reveal-fade", `${CONFIG.revealDuration}ms`);
  setupProjectLinks();
  setupCardEdges();
  runReturnTransition();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize, { once: true });
} else {
  initialize();
}

window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    transitionRunning = false;
    refreshCardEdges();
  }
  runReturnTransition(event);
});
