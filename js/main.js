const CONFIG = {
  // Duration of forward and reverse frame travel in milliseconds.
  duration: 500,
  // Fraction of duration each frame edge trails behind the first edge.
  edgeStagger: { top: 0, left: 0.04, bottom: 0.08, right: 0.12 },
  // Peak corner radius in pixels; set to 0 to disable the mid-flight curve.
  cornerPeak: 0,
  // Duration in milliseconds for the returning block content reveal.
  revealFade: 150,
};

let transitionRunning = false;
const projectLinks = Array.from(document.querySelectorAll(".project-block"));

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function easeInOutQuart(value) {
  return value < 0.5
    ? 8 * value ** 4
    : 1 - ((-2 * value + 2) ** 4) / 2;
}

function snapToDevicePixel(value) {
  const ratio = window.devicePixelRatio || 1;
  return Math.round(value * ratio) / ratio;
}

function frameAt(progress, start, end) {
  const maxLag = Math.max(...Object.values(CONFIG.edgeStagger));
  const edges = {};

  Object.keys(CONFIG.edgeStagger).forEach((edge) => {
    const lagged = clamp(
      (progress - CONFIG.edgeStagger[edge]) / (1 - maxLag),
      0,
      1,
    );
    edges[edge] = snapToDevicePixel(
      start[edge] + (end[edge] - start[edge]) * easeInOutQuart(lagged),
    );
  });

  return {
    ...edges,
    radius: progress === 0 || progress === 1
      ? 0
      : CONFIG.cornerPeak * Math.sin(Math.PI * progress),
  };
}

function applyFrame(overlay, frame) {
  overlay.style.top = `${frame.top}px`;
  overlay.style.left = `${frame.left}px`;
  overlay.style.width = `${frame.right - frame.left}px`;
  overlay.style.height = `${frame.bottom - frame.top}px`;
  overlay.style.borderRadius = `${frame.radius}px`;
}

function getPagePadding() {
  const measurement = document.createElement("div");
  measurement.setAttribute("aria-hidden", "true");
  measurement.className = "page-pad-measurement";
  document.body.append(measurement);
  const padding = Number.parseFloat(getComputedStyle(measurement).width);
  measurement.remove();
  return padding;
}

function getInsetFrame(pagePad = getPagePadding()) {
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;

  return {
    top: pagePad,
    left: pagePad,
    right: viewportWidth - pagePad,
    bottom: viewportHeight - pagePad,
  };
}

function getVisibleProjectFrame(block, pagePad) {
  const rect = block.getBoundingClientRect();
  const header = document.querySelector(".site-header");
  const headerBottom = header ? header.getBoundingClientRect().bottom : 0;
  const viewportBottom = document.documentElement.clientHeight - pagePad;

  return {
    top: snapToDevicePixel(Math.max(rect.top, headerBottom)),
    left: snapToDevicePixel(rect.left),
    right: snapToDevicePixel(rect.right),
    bottom: snapToDevicePixel(Math.min(rect.bottom, viewportBottom)),
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

function runFrameAnimation(overlay, start, end, reverse, onComplete) {
  const startedAt = performance.now();

  function step(now) {
    const elapsed = clamp((now - startedAt) / CONFIG.duration, 0, 1);
    const progress = reverse ? 1 - elapsed : elapsed;
    applyFrame(overlay, frameAt(progress, start, end));

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
  document.querySelectorAll(".project-grid.is-transitioning").forEach((grid) => grid.classList.remove("is-transitioning"));
  document.querySelectorAll(".project-block.is-landing").forEach((block) => block.classList.remove("is-landing"));
  document.documentElement.classList.remove("is-returning");
  transitionRunning = false;
}

function getFrameReturn() {
  try {
    const value = sessionStorage.getItem("frameReturn");
    if (!value) {
      return null;
    }

    sessionStorage.removeItem("frameReturn");
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function runReturnTransition(event) {
  // Project pages share this script but must preserve the state for index.html.
  if (!projectLinks.length) {
    return;
  }

  const returnState = getFrameReturn();

  if (!returnState) {
    if (event && event.persisted) {
      removeTransitionArtifacts();
    }
    return;
  }

  const savedScrollPosition = Number(returnState.scrollY);
  if (Number.isFinite(savedScrollPosition)) {
    window.scrollTo(0, savedScrollPosition);
  }

  const block = projectLinks[returnState.index];
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (prefersReducedMotion || !block || transitionRunning) {
    removeTransitionArtifacts();
    return;
  }

  transitionRunning = true;

  // Read the returning block and inset frame before updating the visible state.
  const pagePad = getPagePadding();
  const target = getVisibleProjectFrame(block, pagePad);
  const source = getInsetFrame(pagePad);
  const overlay = document.querySelector(".frame-overlay") || createOverlay(source);
  applyFrame(overlay, { ...source, radius: 0 });
  document.documentElement.classList.remove("is-returning");
  block.classList.add("is-landing");

  runFrameAnimation(overlay, target, source, true, () => {
    overlay.remove();
    document.querySelectorAll(".project-grid.is-transitioning").forEach((grid) => grid.classList.remove("is-transitioning"));
    transitionRunning = false;
    window.requestAnimationFrame(() => {
      block.classList.remove("is-landing");
    });
  });
}

function saveFrameReturn(index, scrollY) {
  try {
    sessionStorage.setItem("frameReturn", JSON.stringify({ index, scrollY }));
    return true;
  } catch (error) {
    return false;
  }
}

function setupProjectLinks() {
  projectLinks.forEach((link, index) => {
    link.addEventListener("click", (event) => {
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        prefersReducedMotion ||
        transitionRunning ||
        !saveFrameReturn(index, window.scrollY)
      ) {
        return;
      }

      event.preventDefault();
      transitionRunning = true;

      // Read every layout value before creating or styling the overlay.
      const pagePad = getPagePadding();
      const source = getVisibleProjectFrame(link, pagePad);
      const target = getInsetFrame(pagePad);
      const overlay = createOverlay(source);
      const grid = link.closest(".project-grid");
      if (grid) {
        grid.classList.add("is-transitioning");
      }

      let navigated = false;
      const navigate = () => {
        if (navigated) {
          return;
        }

        navigated = true;
        window.clearTimeout(safetyTimeout);
        overlay.style.top = "";
        overlay.style.left = "";
        overlay.style.width = "";
        overlay.style.height = "";
        overlay.style.borderRadius = "0";
        overlay.style.inset = "var(--page-pad)";
        window.location.href = link.href;
      };
      const safetyTimeout = window.setTimeout(navigate, CONFIG.duration + 400);

      runFrameAnimation(overlay, source, target, false, navigate);
    });
  });
}

function setupCardEdges() {
  if (!projectLinks.length) {
    return;
  }

  let pagePad = getPagePadding();
  const header = document.querySelector(".site-header");
  const viewportMeasurement = document.createElement("div");
  let edgeUpdateQueued = false;

  viewportMeasurement.setAttribute("aria-hidden", "true");
  viewportMeasurement.className = "viewport-height-measurement";
  document.body.append(viewportMeasurement);

  function updateVisibleCardEdges() {
    // Match the fixed mask to CSS's dynamic viewport as mobile browser chrome moves.
    const bottomEdge = viewportMeasurement.getBoundingClientRect().bottom - pagePad;
    const pixelRatio = window.devicePixelRatio || 1;
    const edgeThreshold = 1 / pixelRatio;
    const headerBottom = header
      ? Math.round(header.getBoundingClientRect().bottom * pixelRatio) / pixelRatio
      : 0;
    const cardRects = projectLinks.map((block) => ({
      block,
      rect: block.getBoundingClientRect(),
    }));

    document.documentElement.style.setProperty("--header-bottom", `${headerBottom}px`);
    document.documentElement.style.setProperty("--bottom-edge", `${bottomEdge}px`);

    cardRects.forEach(({ block, rect }) => {
      const intersectsBottomEdge = rect.top < bottomEdge && rect.bottom > bottomEdge + edgeThreshold;
      const intersectsTopEdge = rect.top < headerBottom - edgeThreshold && rect.bottom > headerBottom;
      const edgeLeft = Math.round(rect.left * pixelRatio) / pixelRatio;
      const edgeWidth = Math.round(rect.width * pixelRatio) / pixelRatio;

      if (!intersectsBottomEdge) {
        block.classList.remove("is-bottom-clipped");
        block.style.removeProperty("--bottom-edge-left");
        block.style.removeProperty("--bottom-edge-width");
      } else {
        block.classList.add("is-bottom-clipped");
        block.style.setProperty("--bottom-edge-left", `${edgeLeft}px`);
        block.style.setProperty("--bottom-edge-width", `${edgeWidth}px`);
      }

      if (!intersectsTopEdge) {
        block.classList.remove("is-top-clipped");
        block.style.removeProperty("--top-edge-left");
        block.style.removeProperty("--top-edge-width");
      } else {
        block.classList.add("is-top-clipped");
        block.style.setProperty("--top-edge-left", `${edgeLeft}px`);
        block.style.setProperty("--top-edge-width", `${edgeWidth}px`);
      }

    });
  }

  function scheduleVisibleCardEdgeUpdate() {
    if (edgeUpdateQueued) {
      return;
    }

    edgeUpdateQueued = true;
    window.requestAnimationFrame(() => {
      edgeUpdateQueued = false;
      updateVisibleCardEdges();
    });
  }

  window.addEventListener("scroll", scheduleVisibleCardEdgeUpdate, { passive: true });
  window.addEventListener("resize", () => {
    pagePad = getPagePadding();
    scheduleVisibleCardEdgeUpdate();
  });
  document.addEventListener("fullscreenchange", scheduleVisibleCardEdgeUpdate);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", scheduleVisibleCardEdgeUpdate);
    window.visualViewport.addEventListener("scroll", scheduleVisibleCardEdgeUpdate);
  }
  updateVisibleCardEdges();
}

document.addEventListener("DOMContentLoaded", () => {
  document.documentElement.style.setProperty("--reveal-fade", `${CONFIG.revealFade}ms`);
  setupProjectLinks();
  setupCardEdges();
  runReturnTransition();
});

window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    transitionRunning = false;
  }
  runReturnTransition(event);
});
