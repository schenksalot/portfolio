const CONFIG = {
  // Project-frame travel and returning-content reveal timing in milliseconds.
  transitionDuration: 500,
  revealDuration: 150,
  // Each frame edge trails the first edge by this fraction of the transition.
  edgeStagger: { top: 0, left: 0.04, bottom: 0.08, right: 0.12 },
  // Keep transition corners square; raise this only to introduce a rounded flight path.
  cornerPeak: 0,
  // Slim perimeter left around the fully expanded transition frame, in pixels.
  transitionInset: 12,
};

const projectLinks = Array.from(document.querySelectorAll(".project-block"));
const header = document.querySelector(".site-header");
const projectViewport = document.querySelector(".project-viewport");
let transitionRunning = false;
let refreshProjectViewport = () => {};

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

function getTransitionFrame() {
  const inset = CONFIG.transitionInset;
  return {
    top: inset,
    left: inset,
    right: document.documentElement.clientWidth - inset,
    bottom: document.documentElement.clientHeight - inset,
  };
}

function getVisibleProjectFrame(block) {
  const rect = block.getBoundingClientRect();
  const viewportRect = projectViewport
    ? projectViewport.getBoundingClientRect()
    : { top: 0, bottom: document.documentElement.clientHeight };

  return {
    top: snapToDevicePixel(Math.max(rect.top, viewportRect.top)),
    left: snapToDevicePixel(rect.left),
    right: snapToDevicePixel(rect.right),
    bottom: snapToDevicePixel(Math.min(rect.bottom, viewportRect.bottom)),
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
    const scrollY = projectViewport ? projectViewport.scrollTop : window.scrollY;
    sessionStorage.setItem("frameReturn", JSON.stringify({ index, scrollY }));
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
    if (projectViewport) {
      projectViewport.scrollTop = Number(returnState.scrollY);
    } else {
      window.scrollTo(0, Number(returnState.scrollY));
    }
  }

  const block = projectLinks[returnState.index];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion || !block || transitionRunning) {
    removeTransitionArtifacts();
    return;
  }

  transitionRunning = true;
  const source = getTransitionFrame();
  const target = getVisibleProjectFrame(block);
  const overlay = document.querySelector(".frame-overlay") || createOverlay(source);

  applyFrame(overlay, { ...source, radius: 0 });
  document.documentElement.classList.remove("is-returning");
  block.classList.add("is-landing");

  animateFrame(overlay, target, source, true, () => {
    overlay.remove();
    block.closest(".project-grid")?.classList.remove("is-transitioning");
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

      const source = getVisibleProjectFrame(link);
      const target = getTransitionFrame();
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
        overlay.style.cssText = `inset: ${CONFIG.transitionInset}px; border-radius: 0;`;
        window.location.href = link.href;
      };
      const safetyTimeout = window.setTimeout(navigate, CONFIG.transitionDuration + 400);

      animateFrame(overlay, source, target, false, navigate);
    });
  });
}

function setupProjectViewport() {
  if (!projectViewport || !header) {
    return;
  }

  let queued = false;
  const createStretchSide = () => {
    const side = document.createElement("div");
    side.className = "project-stretch-side";
    side.setAttribute("aria-hidden", "true");
    document.body.append(side);
    return side;
  };
  const stretchSides = {
    top: [createStretchSide(), createStretchSide()],
    bottom: [createStretchSide(), createStretchSide()],
  };

  function setStretch(block, className, sides, rect, height, top) {
    if (height <= 0) {
      clearStretch(block, className, sides);
      return;
    }

    block.classList.add(className);
    const left = snapToDevicePixel(rect.left);
    const right = snapToDevicePixel(rect.right - 1);
    const edgeTop = snapToDevicePixel(top);
    const edgeHeight = snapToDevicePixel(height);
    sides.forEach((side, index) => {
      side.style.left = `${index === 0 ? left : right}px`;
      side.style.top = `${edgeTop}px`;
      side.style.height = `${edgeHeight}px`;
      side.style.opacity = "1";
    });
  }

  function clearStretch(block, className, sides) {
    if (!block.classList.contains(className)) {
      return;
    }

    block.classList.remove(className);
    sides.forEach((side) => {
      side.style.opacity = "0";
    });
  }

  function update() {
    const headerBottom = snapToDevicePixel(header.getBoundingClientRect().bottom);
    document.documentElement.style.setProperty("--header-bottom", `${headerBottom}px`);
    const viewportRect = projectViewport.getBoundingClientRect();
    const threshold = 1 / (window.devicePixelRatio || 1);
    let touchesTop = projectViewport.scrollTop <= threshold;
    let touchesBottom = projectViewport.scrollTop + projectViewport.clientHeight
      >= projectViewport.scrollHeight - threshold;

    projectLinks.forEach((block) => {
      const rect = block.getBoundingClientRect();
      touchesTop ||= rect.top <= viewportRect.top + threshold
        && rect.bottom >= viewportRect.top - threshold;
      touchesBottom ||= rect.top <= viewportRect.bottom + threshold
        && rect.bottom >= viewportRect.bottom - threshold;
    });

    const firstBlock = projectLinks[0];
    const lastBlock = projectLinks[projectLinks.length - 1];
    const firstRect = firstBlock.getBoundingClientRect();
    const lastRect = lastBlock.getBoundingClientRect();
    const topStretch = projectViewport.scrollTop <= threshold
      ? firstRect.top - viewportRect.top
      : 0;
    const bottomStretch = projectViewport.scrollTop + projectViewport.clientHeight
      >= projectViewport.scrollHeight - threshold
      ? viewportRect.bottom - lastRect.bottom
      : 0;

    if (topStretch > threshold) {
      setStretch(
        firstBlock,
        "is-top-stretched",
        stretchSides.top,
        firstRect,
        topStretch,
        viewportRect.top,
      );
    } else {
      clearStretch(firstBlock, "is-top-stretched", stretchSides.top);
    }

    if (bottomStretch > threshold) {
      setStretch(
        lastBlock,
        "is-bottom-stretched",
        stretchSides.bottom,
        lastRect,
        bottomStretch,
        viewportRect.bottom - bottomStretch,
      );
    } else {
      clearStretch(lastBlock, "is-bottom-stretched", stretchSides.bottom);
    }

    projectViewport.classList.toggle("has-top-edge", touchesTop);
    projectViewport.classList.toggle("has-bottom-edge", touchesBottom);
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

  refreshProjectViewport = scheduleUpdate;
  projectViewport.addEventListener("scroll", scheduleUpdate, { passive: true });
  projectViewport.addEventListener("touchmove", scheduleUpdate, { passive: true });
  projectViewport.addEventListener("touchend", scheduleUpdate, { passive: true });
  window.addEventListener("resize", scheduleUpdate);
  window.addEventListener("orientationchange", scheduleUpdate);
  window.visualViewport?.addEventListener("resize", scheduleUpdate);
  update();
}

function initialize() {
  document.documentElement.style.setProperty("--reveal-fade", `${CONFIG.revealDuration}ms`);
  document.documentElement.style.setProperty("--transition-inset", `${CONFIG.transitionInset}px`);
  setupProjectLinks();
  setupProjectViewport();
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
    refreshProjectViewport();
  }
  runReturnTransition(event);
});
