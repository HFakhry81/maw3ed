import React, { useMemo, useState } from "react";
import { api } from "./api";
import { SearchableSelect } from "./uiFields.jsx";
import { confirmSaved, confirmSaveFailed } from "./saveFeedback.jsx";

/**
 * Compact providers table grouped by service for a category.
 * Source of truth = service.providerIds (live from ops).
 */
export function CategoryProvidersTable({
  ops,
  categoryId,
  reload,
  onOpenService,
  onGoToServicesCategory,
  title = "مقدمو الخدمات في هذه الفئة"
}) {
  const categories = ops?.serviceCategories || [];
  const staff = (ops?.staff || []).filter((person) => person.active !== false);
  const category = categories.find((item) => item.id === categoryId) || null;
  const services = useMemo(
    () => (ops?.services || []).filter(
      (service) => service.categoryId === categoryId && service.active !== false
    ),
    [ops, categoryId]
  );

  const [addingFor, setAddingFor] = useState("");
  const [pickName, setPickName] = useState("");
  const [busy, setBusy] = useState(false);

  const staffNameOptions = staff.map((person) => person.name);

  const addProvider = async (serviceId) => {
    const person = staff.find((item) => item.name === pickName);
    if (!person) {
      window.alert("اختر موظفاً من القائمة");
      return;
    }
    const service = services.find((item) => item.id === serviceId);
    const nextIds = [...new Set([...(service?.providerIds || []), person.id])];
    setBusy(true);
    try {
      await api.patch(`/api/ops/services/${serviceId}`, { providerIds: nextIds });
      setAddingFor("");
      setPickName("");
      reload?.();
      confirmSaved("تم ربط المقدم بالخدمة");
    } catch (error) {
      confirmSaveFailed("تعذر الربط", error.message);
    } finally {
      setBusy(false);
    }
  };

  const removeProvider = async (service, provider) => {
    if (!window.confirm(`إزالة «${provider.name}» من خدمة «${service.name}»؟`)) return;
    const nextIds = (service.providerIds || []).filter((id) => id !== provider.id);
    setBusy(true);
    try {
      await api.patch(`/api/ops/services/${service.id}`, { providerIds: nextIds });
      reload?.();
      confirmSaved("تم إزالة المقدم");
    } catch (error) {
      confirmSaveFailed("تعذر الإزالة", error.message);
    } finally {
      setBusy(false);
    }
  };

  if (!categoryId) {
    return (
      <div className="panel providers-table-panel">
        <p className="muted" style={{ margin: 0 }}>اختر فئة لعرض مقدمي خدماتها.</p>
      </div>
    );
  }

  return (
    <div className="panel providers-table-panel">
      <div className="providers-table-head">
        <div>
          <b>{title}</b>
          <small>{category?.name || "—"} · {services.length} خدمة</small>
        </div>
        {onGoToServicesCategory ? (
          <button type="button" className="ghost-button" onClick={() => onGoToServicesCategory(categoryId)}>
            فتح شاشة الخدمات
          </button>
        ) : null}
      </div>

      {!services.length ? (
        <div className="empty-state">لا خدمات في هذه الفئة بعد.</div>
      ) : (
        <div className="providers-by-service">
          {services.map((service, index) => {
            const providers = Array.isArray(service.providers) && service.providers.length
              ? service.providers
              : (service.providerIds || [])
                .map((id) => staff.find((person) => person.id === id))
                .filter(Boolean)
                .map((person) => ({ id: person.id, name: person.name, title: person.title || "" }));
            const available = staff.filter((person) => !(service.providerIds || []).includes(person.id));
            return (
              <div className={`providers-service-block${index % 2 ? " is-alt" : ""}`} key={service.id}>
                <div className="providers-service-title">
                  <b>{service.name}</b>
                  <span>{providers.length} مقدم</span>
                  <div className="providers-service-actions">
                    {onOpenService ? (
                      <button type="button" className="edit-button" onClick={() => onOpenService(service)}>تعديل الخدمة</button>
                    ) : null}
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={!available.length || busy}
                      onClick={() => {
                        setAddingFor(service.id);
                        setPickName(available[0]?.name || "");
                      }}
                    >
                      + مقدم
                    </button>
                  </div>
                </div>

                <div className="providers-mini-table">
                  <div className="providers-mini-head" aria-hidden="true">
                    <span>المقدم</span>
                    <span>المهنة</span>
                    <span />
                  </div>
                  {!providers.length ? (
                    <div className="providers-mini-empty">لا مقدم مربوط — لن يُقبل حجز على هذه الخدمة.</div>
                  ) : (
                    providers.map((provider) => (
                      <div className="providers-mini-row" key={provider.id}>
                        <span>{provider.name}</span>
                        <span className="muted">{provider.title || "—"}</span>
                        <button
                          type="button"
                          className="danger-button"
                          disabled={busy}
                          onClick={() => removeProvider(service, provider)}
                        >
                          حذف
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {addingFor === service.id ? (
                  <div className="providers-add-row">
                    <SearchableSelect
                      options={available.map((person) => person.name)}
                      value={pickName}
                      onChange={setPickName}
                      placeholder="اختر موظفاً…"
                      allowCustom={false}
                    />
                    <button type="button" className="primary-button" disabled={busy || !pickName} onClick={() => addProvider(service.id)}>
                      ربط
                    </button>
                    <button type="button" className="ghost-button" onClick={() => { setAddingFor(""); setPickName(""); }}>
                      إلغاء
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
