import { useEffect } from "react";

const FOCUSABLE = "input, textarea, select, [contenteditable='true']";

function measureKeyboardInset() {
  const vv = window.visualViewport;
  if (!vv) return 0;
  // Soft keyboard: layout viewport stays tall while visual viewport shrinks (esp. iOS).
  const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  // Ignore tiny chrome changes (URL bar / browser UI).
  return inset > 60 ? Math.round(inset) : 0;
}

function scrollFocusedFieldIntoView(target) {
  if (!target || typeof target.closest !== "function") return;
  if (!target.matches?.(FOCUSABLE) && !target.closest?.(FOCUSABLE)) return;
  const el = target.matches?.(FOCUSABLE) ? target : target.closest(FOCUSABLE);
  if (!el) return;
  // Wait for keyboard animation / visualViewport settle.
  window.setTimeout(() => {
    try {
      el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    } catch {
      el.scrollIntoView(true);
    }
  }, 180);
}

/**
 * Keeps --keyboard-inset in sync with the mobile soft keyboard and
 * scrolls the focused field into the visible area.
 */
export function useKeyboardInset() {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;

    const apply = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const inset = measureKeyboardInset();
        root.style.setProperty("--keyboard-inset", `${inset}px`);
        root.classList.toggle("keyboard-open", inset > 0);
      });
    };

    const onFocusIn = (event) => {
      apply();
      scrollFocusedFieldIntoView(event.target);
      // Second pass after keyboard fully open (Android/iOS timing differs).
      window.setTimeout(apply, 280);
    };

    const vv = window.visualViewport;
    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", apply);
    apply();

    return () => {
      cancelAnimationFrame(frame);
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", apply);
      root.style.setProperty("--keyboard-inset", "0px");
      root.classList.remove("keyboard-open");
    };
  }, []);
}

/** Invisible footer that grows to the soft-keyboard height. */
export function KeyboardSpacer({ className = "" }) {
  return <div className={`keyboard-spacer ${className}`.trim()} aria-hidden="true" />;
}
