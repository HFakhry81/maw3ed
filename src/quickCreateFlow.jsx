import React, { useCallback, useState } from "react";
import { api } from "./api";
import { confirmSaved, confirmSaveFailed } from "./saveFeedback.jsx";

/**
 * Reusable temporary overlay stack for “create missing item then return”.
 * Push a layer while a parent form stays underneath; finish(result) / cancel() pops it.
 */
export function useQuickCreateStack() {
  const [layers, setLayers] = useState([]);

  const push = useCallback((layer) => {
    const id = `qc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    return new Promise((resolve) => {
      setLayers((prev) => [...prev, { id, title: layer.title || "إضافة", render: layer.render, resolve }]);
    });
  }, []);

  const finishTop = useCallback((result) => {
    setLayers((prev) => {
      if (!prev.length) return prev;
      const top = prev[prev.length - 1];
      top.resolve?.(result);
      return prev.slice(0, -1);
    });
  }, []);

  const cancelTop = useCallback(() => finishTop(null), [finishTop]);

  const host = (
    <QuickCreateHost layers={layers} onFinish={finishTop} onCancel={cancelTop} />
  );

  return { layers, push, finishTop, cancelTop, host };
}

function QuickCreateHost({ layers, onFinish, onCancel }) {
  if (!layers.length) return null;
  return layers.map((layer, index) => (
    <div
      key={layer.id}
      className="quick-create-backdrop"
      style={{ zIndex: 60 + index }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <aside className="quick-create-panel drawer-panel" role="dialog" aria-modal="true">
        <header>
          <h3>{layer.title}</h3>
          <button type="button" onClick={onCancel} aria-label="close">✕</button>
        </header>
        <div className="drawer-body">
          {typeof layer.render === "function"
            ? layer.render({
                finish: (value) => onFinish(value),
                cancel: onCancel
              })
            : null}
        </div>
      </aside>
    </div>
  ));
}

/** Compact form: create a service category and return the created record. */
export function CategoryQuickCreateForm({ initialName = "", onSaved, onCancel }) {
  const [name, setName] = useState(String(initialName || "").trim());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    const next = String(name || "").trim();
    if (!next) {
      setError("اسم الفئة مطلوب");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api.post("/api/ops/service-categories", { name: next });
      const category = result.category || result;
      confirmSaved("تم حفظ الفئة");
      onSaved?.(category);
    } catch (err) {
      setError(err.message || "تعذر إنشاء الفئة");
      confirmSaveFailed("تعذر إنشاء الفئة", err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack-form quick-create-form" onSubmit={submit}>
      <p className="muted">أضف فئة خدمة جديدة ثم ستعود تلقائياً للنموذج السابق مع اختيارها.</p>
      <label>
        اسم الفئة
        <input
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="مثال: الجلدية"
        />
      </label>
      {error ? <div className="error-banner">{error}</div> : null}
      <div className="form-actions">
        <button type="button" className="ghost-button" onClick={onCancel} disabled={busy}>إلغاء</button>
        <button type="submit" className="primary-button" disabled={busy}>
          {busy ? "جارٍ الحفظ…" : "حفظ الفئة"}
        </button>
      </div>
    </form>
  );
}

/** Compact form: create a service under a category and return the created record. */
export function ServiceQuickCreateForm({
  initialName = "",
  categoryId = "",
  categoryName = "",
  onSaved,
  onCancel
}) {
  const [name, setName] = useState(String(initialName || "").trim());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    const next = String(name || "").trim();
    if (!next) {
      setError("اسم الخدمة مطلوب");
      return;
    }
    if (!categoryId) {
      setError("اختر فئة خدمة أولاً");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api.post("/api/ops/services", {
        name: next,
        categoryId,
        durationMinutes: 30,
        bufferMinutes: 15,
        pricingType: "fixed",
        price: 0,
        publicBooking: true,
        active: true
      });
      const service = result.service || result;
      confirmSaved("تم حفظ الخدمة");
      onSaved?.(service);
    } catch (err) {
      setError(err.message || "تعذر إنشاء الخدمة");
      confirmSaveFailed("تعذر إنشاء الخدمة", err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack-form quick-create-form" onSubmit={submit}>
      <p className="muted">
        أضف خدمة جديدة{categoryName ? ` ضمن «${categoryName}»` : ""} ثم ستعود للنموذج السابق مع ربطها.
      </p>
      <label>
        اسم الخدمة
        <input
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="مثال: كشف عام"
        />
      </label>
      {categoryName ? <p className="muted">الفئة: <b>{categoryName}</b></p> : null}
      {error ? <div className="error-banner">{error}</div> : null}
      <div className="form-actions">
        <button type="button" className="ghost-button" onClick={onCancel} disabled={busy}>إلغاء</button>
        <button type="submit" className="primary-button" disabled={busy}>
          {busy ? "جارٍ الحفظ…" : "حفظ الخدمة"}
        </button>
      </div>
    </form>
  );
}

/**
 * Open category quick-create, then resolve with the created category (or null if cancelled).
 * Typical use from a parent form that stays mounted underneath.
 */
export async function openCategoryQuickCreate(stack, { initialName = "" } = {}) {
  return stack.push({
    title: "إضافة فئة",
    render: ({ finish, cancel }) => (
      <CategoryQuickCreateForm
        initialName={initialName}
        onCancel={cancel}
        onSaved={(category) => finish(category)}
      />
    )
  });
}

/** Open service quick-create under a category. */
export async function openServiceQuickCreate(stack, { initialName = "", categoryId = "", categoryName = "" } = {}) {
  return stack.push({
    title: "إضافة خدمة",
    render: ({ finish, cancel }) => (
      <ServiceQuickCreateForm
        initialName={initialName}
        categoryId={categoryId}
        categoryName={categoryName}
        onCancel={cancel}
        onSaved={(service) => finish(service)}
      />
    )
  });
}
