import React, { useMemo, useState } from "react";
import { api } from "./api";
import { confirmSaved, confirmSaveFailed } from "./saveFeedback.jsx";

/**
 * Thin resources surface for Phase 5 — exposes capacity resources without claiming
 * education / salon / rental vertical product readiness.
 */
export function ResourcesView({ ops, reload, locale, canWrite = true, Drawer }) {
  const resources = ops?.resources || [];
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    resourceType: "room",
    capacity: 1,
    unit: "seat",
    status: "active",
    location: ""
  });

  const summary = useMemo(() => {
    const active = resources.filter((row) => row.status !== "inactive" && row.active !== false);
    return { total: resources.length, active: active.length };
  }, [resources]);

  const submit = async (event) => {
    event.preventDefault();
    if (!canWrite) return;
    try {
      await api.post("/api/ops/resources", {
        name: form.name.trim(),
        resourceType: form.resourceType,
        capacity: Math.max(1, Number(form.capacity) || 1),
        unit: form.unit,
        status: form.status,
        location: form.location.trim()
      });
      setOpen(false);
      setForm({ name: "", resourceType: "room", capacity: 1, unit: "seat", status: "active", location: "" });
      reload?.();
      confirmSaved("تم حفظ المورد");
    } catch (error) {
      confirmSaveFailed("تعذر حفظ المورد", error.message);
    }
  };

  const toggleStatus = async (resource) => {
    if (!canWrite) return;
    const next = resource.status === "inactive" ? "active" : "inactive";
    try {
      await api.patch(`/api/ops/resources/${resource.id}`, { status: next });
      reload?.();
    } catch (error) {
      window.alert(error.message || "تعذر تحديث المورد");
    }
  };

  const formBody = (
    <form className="stack-form" onSubmit={submit}>
      <label>
        الاسم
        <input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="قاعة أ"
        />
      </label>
      <label>
        النوع
        <select value={form.resourceType} onChange={(e) => setForm({ ...form, resourceType: e.target.value })}>
          <option value="room">قاعة / غرفة</option>
          <option value="chair">كرسي</option>
          <option value="equipment">جهاز</option>
          <option value="table">طاولة</option>
          <option value="other">أخرى</option>
        </select>
      </label>
      <div className="form-row">
        <label>
          السعة
          <input
            type="number"
            min={1}
            required
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
          />
        </label>
        <label>
          الوحدة
          <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
            <option value="seat">مقعد</option>
            <option value="unit">وحدة</option>
          </select>
        </label>
      </div>
      <label>
        الموقع
        <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="الطابق الأول" />
      </label>
      <p className="muted" lang={String(locale || "ar").startsWith("ar") ? "ar" : "en"}>
        السعة المادية تُفرض عند التسجيل الجماعي؛ لا تُستنتج من قالب النشاط.
      </p>
      <div className="form-actions">
        <button className="primary-button" type="submit">
          حفظ
        </button>
      </div>
    </form>
  );

  return (
    <section className="ops-page" aria-labelledby="resources-title">
      <div className="ops-header">
        <div>
          <h1 id="resources-title">الموارد</h1>
          <p>
            قاعات وكراسي وأجهزة مرتبطة بنمط الإشغال — نواة السعة جاهزة؛ لا يُعلن قالب التعليم/الصالون/التأجير جاهزاً للإنتاج من هذه الشاشة.
          </p>
        </div>
        {canWrite ? (
          <button className="primary-button" type="button" onClick={() => setOpen(true)}>
            + مورد
          </button>
        ) : null}
      </div>

      <div className="stats-cards" role="group" aria-label="ملخص الموارد">
        <article className="panel kpi">
          <span>إجمالي</span>
          <b>{summary.total}</b>
        </article>
        <article className="panel kpi">
          <span>نشط</span>
          <b>{summary.active}</b>
        </article>
      </div>

      <div className="panel">
        {!resources.length ? (
          <div className="empty-state">لا موارد بعد. أضف قاعة أو جهازاً لربطه بخدمات ذات نمط exclusive أو rental.</div>
        ) : (
          <div className="dir-table-wrap">
            <table className="dir-table">
              <thead>
                <tr>
                  <th scope="col">الاسم</th>
                  <th scope="col">النوع</th>
                  <th scope="col">السعة</th>
                  <th scope="col">الوحدة</th>
                  <th scope="col">الموقع</th>
                  <th scope="col">الحالة</th>
                  {canWrite ? <th scope="col">إجراءات</th> : null}
                </tr>
              </thead>
              <tbody>
                {resources.map((resource, index) => (
                  <tr key={resource.id} className={index % 2 ? "is-alt" : ""}>
                    <td>
                      <b>{resource.name}</b>
                    </td>
                    <td>{resource.resourceType || resource.kind || resource.type || "—"}</td>
                    <td>{resource.capacity ?? resource.seats ?? "—"}</td>
                    <td>{resource.unit || "seat"}</td>
                    <td>{resource.location || "—"}</td>
                    <td>{resource.status === "inactive" || resource.active === false ? "متوقف" : "نشط"}</td>
                    {canWrite ? (
                      <td className="dir-actions">
                        <button type="button" className="warn-button" onClick={() => toggleStatus(resource)}>
                          {resource.status === "inactive" ? "تفعيل" : "إيقاف"}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {Drawer ? (
        <Drawer title="مورد جديد" open={open} onClose={() => setOpen(false)}>
          {formBody}
        </Drawer>
      ) : open ? (
        <div className="panel" style={{ marginTop: 12 }}>
          <h3>مورد جديد</h3>
          {formBody}
          <button type="button" className="ghost-button" onClick={() => setOpen(false)}>
            إلغاء
          </button>
        </div>
      ) : null}
    </section>
  );
}
