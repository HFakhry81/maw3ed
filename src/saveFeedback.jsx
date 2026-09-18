import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

const SaveFeedbackContext = createContext(null);

/** Imperative bus so any module can confirm a save without prop drilling. */
let externalNotify = null;

function notify(payload) {
  if (typeof externalNotify === "function") externalNotify(payload);
}

/**
 * Call after a successful create/update.
 * @param {string} [title="تم الحفظ"]
 * @param {string} [detail=""]
 */
export function confirmSaved(title = "تم الحفظ", detail = "تم تسجيل التغييرات بنجاح") {
  notify({
    id: `ok-${Date.now()}`,
    tone: "success",
    title: title || "تم الحفظ",
    detail: detail || "تم تسجيل التغييرات بنجاح"
  });
}

/** Call after a failed save (optional alternative to window.alert). */
export function confirmSaveFailed(title = "تعذر الحفظ", detail = "") {
  notify({
    id: `err-${Date.now()}`,
    tone: "error",
    title: title || "تعذر الحفظ",
    detail: detail || ""
  });
}

/**
 * Run an async save and show success/failure feedback.
 * @returns {Promise<*>} result of action, or undefined on failure when swallowError
 */
export async function runWithSaveFeedback(action, {
  successTitle = "تم الحفظ",
  successDetail = "تم تسجيل التغييرات بنجاح",
  errorTitle = "تعذر الحفظ",
  swallowError = false
} = {}) {
  try {
    const result = await action();
    confirmSaved(successTitle, successDetail);
    return result;
  } catch (error) {
    const message = error?.message || errorTitle;
    confirmSaveFailed(errorTitle, message);
    if (!swallowError) throw error;
    return undefined;
  }
}

export function useSaveFeedback() {
  const ctx = useContext(SaveFeedbackContext);
  if (!ctx) {
    return { confirmSaved, confirmSaveFailed, runWithSaveFeedback };
  }
  return ctx;
}

export function SaveFeedbackProvider({ children }) {
  const [toast, setToast] = useState(null);
  const dismiss = useCallback(() => setToast(null), []);

  useEffect(() => {
    externalNotify = setToast;
    return () => {
      if (externalNotify === setToast) externalNotify = null;
    };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), toast.tone === "error" ? 4200 : 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const api = {
    confirmSaved,
    confirmSaveFailed,
    runWithSaveFeedback,
    dismiss
  };

  return (
    <SaveFeedbackContext.Provider value={api}>
      {children}
      {toast ? (
        <div
          className={`save-toast save-toast-${toast.tone}`}
          role="status"
          aria-live="polite"
          onClick={dismiss}
        >
          <span className="save-toast-mark" aria-hidden="true">
            {toast.tone === "error" ? "!" : "✓"}
          </span>
          <div>
            <b>{toast.title}</b>
            {toast.detail ? <small>{toast.detail}</small> : null}
          </div>
        </div>
      ) : null}
    </SaveFeedbackContext.Provider>
  );
}
