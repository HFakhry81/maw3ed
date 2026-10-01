import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { formatMoney } from "./i18n";
import { confirmSaved, confirmSaveFailed } from "./saveFeedback.jsx";
import { staffRoleGroupId } from "./staffRoleGroups.js";
import { QrCodeScanner } from "./QrCodeScanner.jsx";

function pricingTypeLabel(type) {
  if (type === "range") return "نطاق";
  if (type === "on_request") return "عند الطلب";
  if (type === "free") return "مجاني";
  return "ثابت";
}

function lineAmountHint(line) {
  if (line.pricingType === "range") return `${line.priceMin}–${line.priceMax}`;
  if (line.pricingType === "on_request") return "أدخل عرض السعر";
  if (line.pricingType === "free") return "مجاني";
  return null;
}

function buildPriceDraft(visit) {
  const draft = {};
  for (const line of visit?.lineItems || []) {
    draft[line.id] = line.needsFinalPrice
      ? (line.pricingType === "on_request" && !line.amount ? "" : String(line.amount ?? ""))
      : String(line.amount ?? 0);
  }
  return draft;
}

/**
 * Department attendance desk: QR / token check-in + active visit add-ons + visit pricing report.
 */
export function DepartmentDeskView({ ops, locale, reloadAppointments }) {
  const categories = ops?.serviceCategories || [];
  const [categoryId, setCategoryId] = useState(categories[0]?.id || "");
  const [actorStaffId, setActorStaffId] = useState("");
  const [desk, setDesk] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState("");
  const [checkInBusy, setCheckInBusy] = useState(false);
  const [scanToken, setScanToken] = useState("");
  const [review, setReview] = useState(null);
  const [reviewForm, setReviewForm] = useState(null);
  const [addonOpen, setAddonOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeAuto, setCompleteAuto] = useState(false);
  const [priceDraft, setPriceDraft] = useState({});
  const [completeNotes, setCompleteNotes] = useState("");
  const [completeBusy, setCompleteBusy] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const autoPromptedRef = useRef(new Set());

  const deskStaff = useMemo(() => {
    return (ops?.staff || []).filter((person) => {
      if (person.active === false) return false;
      const role = staffRoleGroupId(person.title);
      if (!categoryId) return role === "admin";
      return (
        role === "admin"
        || person.serviceCategoryId === categoryId
        || (ops?.services || []).some(
          (service) => service.categoryId === categoryId && (service.providerIds || []).includes(person.id)
        )
      );
    });
  }, [ops, categoryId]);

  const categoryServices = useMemo(
    () => (ops?.services || []).filter(
      (service) => service.categoryId === categoryId && service.active !== false
    ),
    [ops, categoryId]
  );

  const activeVisit = useMemo(() => {
    const rows = desk?.active || [];
    return rows.find((item) => item.id === activeId) || rows[0] || null;
  }, [desk, activeId]);

  const loadDesk = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.get(
        `/api/ops/desk/today?categoryId=${encodeURIComponent(categoryId || "")}`
      );
      setDesk(result.desk || null);
      if (result.desk?.active?.length && !activeId) {
        setActiveId(result.desk.active[0].id);
      }
    } catch (err) {
      setError(err.message || "تعذر تحميل شاشة الحضور");
    } finally {
      setLoading(false);
    }
  }, [categoryId, activeId]);

  useEffect(() => {
    loadDesk();
  }, [categoryId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!actorStaffId && deskStaff[0]?.id) setActorStaffId(deskStaff[0].id);
  }, [deskStaff, actorStaffId]);

  // Live clock + soft poll so duration auto-end and line list stay current.
  useEffect(() => {
    const tick = window.setInterval(() => setNowTick(Date.now()), 15000);
    const poll = window.setInterval(() => {
      loadDesk();
    }, 30000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(poll);
    };
  }, [loadDesk]);

  const openCompleteReport = useCallback((visit, { auto = false } = {}) => {
    if (!visit) return;
    setActiveId(visit.id);
    setCompleteAuto(Boolean(auto));
    setCompleteNotes("");
    setPriceDraft(buildPriceDraft(visit));
    setCompleteOpen(true);
  }, []);

  // Auto-open pricing report when service duration elapses.
  useEffect(() => {
    const due = (desk?.active || []).filter((item) => {
      if (item.autoEndDue) return true;
      if (!item.expectedEndAt) return false;
      return Date.parse(item.expectedEndAt) <= nowTick;
    });
    for (const visit of due) {
      if (autoPromptedRef.current.has(visit.id)) continue;
      if (completeOpen) continue;
      autoPromptedRef.current.add(visit.id);
      openCompleteReport(visit, { auto: true });
      break;
    }
  }, [desk, nowTick, completeOpen, openCompleteReport]);

  const extractToken = (rawToken) => {
    const token = String(rawToken || "").trim();
    if (!token) return "";
    try {
      if (token.includes("token=")) {
        const url = new URL(token, window.location.origin);
        return url.searchParams.get("token") || token;
      }
      if (token.includes("/pass/")) {
        const parts = token.split("/pass/");
        return decodeURIComponent((parts[1] || "").split(/[?#]/)[0]);
      }
    } catch {
      return token;
    }
    return token;
  };

  const doCheckIn = useCallback(async (rawToken) => {
    const checkToken = extractToken(rawToken);
    if (!checkToken) return;
    setCheckInBusy(true);
    try {
      const result = await api.post("/api/ops/desk/preview", { token: checkToken });
      const appointment = result.appointment;
      setScanToken(checkToken);
      setReview(result);
      setReviewForm({
        customerName: appointment.customerName || "",
        categoryId: appointment.categoryId || "",
        serviceId: appointment.serviceId || "",
        staffId: appointment.staffId || "",
        date: appointment.date || "",
        time: appointment.time || "",
        amount: appointment.amount ?? 0
      });
      if (appointment.categoryId) setCategoryId(appointment.categoryId);
    } catch (err) {
      confirmSaveFailed("تعذر قراءة رمز الحضور", err.message);
      throw err;
    } finally {
      setCheckInBusy(false);
    }
  }, []);

  const confirmCheckIn = async () => {
    if (!scanToken || !reviewForm) return;
    setCheckInBusy(true);
    try {
      const result = await api.post("/api/ops/desk/check-in", {
        token: scanToken,
        actorStaffId,
        updates: reviewForm
      });
      const saved = result.appointment;
      if (saved?.categoryId) setCategoryId(saved.categoryId);
      setActiveId(saved?.id || "");
      setReview(null);
      setReviewForm(null);
      confirmSaved("تم تسجيل الحضور وضبط شاشة القسم");
      await loadDesk();
      reloadAppointments?.();
    } catch (err) {
      confirmSaveFailed("تعذر تسجيل الحضور", err.message);
    } finally {
      setCheckInBusy(false);
    }
  };

  const addAddon = async (serviceId) => {
    if (!activeVisit?.id) return;
    try {
      const result = await api.post(`/api/ops/desk/appointments/${activeVisit.id}/addons`, {
        serviceId,
        actorStaffId
      });
      setAddonOpen(false);
      setActiveId(result.appointment?.id || activeVisit.id);
      confirmSaved("أُضيفت الخدمة إلى قائمة الزيارة");
      await loadDesk();
      reloadAppointments?.();
    } catch (err) {
      confirmSaveFailed("تعذر إضافة الخدمة", err.message);
    }
  };

  const saveLiveLinePrice = async (line) => {
    if (!activeVisit?.id || !line?.needsFinalPrice) return;
    const raw = priceDraft[line.id];
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) {
      confirmSaveFailed("مبلغ غير صالح", line.name);
      return;
    }
    try {
      await api.patch(
        `/api/ops/desk/appointments/${activeVisit.id}/lines/${line.id}/pricing`,
        { amount, actorStaffId }
      );
      confirmSaved(`ثُبّت سعر «${line.name}»`);
      await loadDesk();
      reloadAppointments?.();
    } catch (err) {
      confirmSaveFailed("تعذر تثبيت السعر", err.message);
    }
  };

  const submitComplete = async () => {
    if (!activeVisit?.id) return;
    const linePrices = (activeVisit.lineItems || [])
      .filter((line) => line.needsFinalPrice || priceDraft[line.id] !== undefined)
      .map((line) => ({
        lineId: line.id,
        amount: Number(priceDraft[line.id])
      }))
      .filter((entry) => Number.isFinite(entry.amount));

    // Require every pending line to have a numeric amount in the draft.
    for (const line of activeVisit.lineItems || []) {
      if (!line.needsFinalPrice) continue;
      const amount = Number(priceDraft[line.id]);
      if (!Number.isFinite(amount) || amount < 0) {
        confirmSaveFailed("أدخل السعر النهائي", line.name);
        return;
      }
      if (line.pricingType === "range") {
        if (amount < Number(line.priceMin) || amount > Number(line.priceMax)) {
          confirmSaveFailed(
            `السعر خارج النطاق ${line.priceMin}–${line.priceMax}`,
            line.name
          );
          return;
        }
      }
    }

    setCompleteBusy(true);
    try {
      await api.post(`/api/ops/desk/appointments/${activeVisit.id}/complete`, {
        actorStaffId,
        notes: completeNotes,
        linePrices,
        autoEnded: completeAuto
      });
      confirmSaved(completeAuto ? "أُغلقت الزيارة تلقائياً بعد انتهاء المدة" : "أُغلقت الزيارة");
      autoPromptedRef.current.delete(activeVisit.id);
      setCompleteOpen(false);
      setCompleteAuto(false);
      setActiveId("");
      await loadDesk();
      reloadAppointments?.();
    } catch (err) {
      confirmSaveFailed("تعذر إنهاء الزيارة", err.message);
    } finally {
      setCompleteBusy(false);
    }
  };

  const statusLabel = (status) => {
    if (status === "checked_in") return "حضر";
    if (status === "confirmed") return "مؤكد";
    if (status === "pending") return "بانتظار";
    if (status === "completed") return "مكتمل";
    return status || "—";
  };

  const remainingLabel = (visit) => {
    if (!visit?.expectedEndAt) return null;
    const ms = Date.parse(visit.expectedEndAt) - nowTick;
    if (ms <= 0) return "انتهت المدة — جاهز للإنهاء";
    const mins = Math.ceil(ms / 60000);
    return `متبقي ≈ ${mins} د`;
  };

  // Keep draft keys in sync when visit lines change; never overwrite in-progress edits.
  useEffect(() => {
    if (!activeVisit) return;
    setPriceDraft((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const line of activeVisit.lineItems || []) {
        if (next[line.id] !== undefined) continue;
        next[line.id] = line.needsFinalPrice && line.pricingType === "on_request" && !line.amount
          ? ""
          : String(line.amount ?? "");
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [activeVisit?.id, activeVisit?.lineItems]); // eslint-disable-line react-hooks/exhaustive-deps

  const reportTotal = useMemo(() => {
    const lines = activeVisit?.lineItems || [];
    return lines.reduce((sum, line) => {
      const draft = priceDraft[line.id];
      const amount = draft !== undefined && draft !== "" ? Number(draft) : Number(line.amount || 0);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
  }, [activeVisit, priceDraft]);

  return (
    <section className="ops-page desk-page">
      <div className="ops-header">
        <div>
          <h1>حضور وتشغيل القسم</h1>
          <p>QR · خدمات أثناء الجلسة · تقرير تسعير عند الإنهاء · إغلاق تلقائي بالمدة</p>
        </div>
        <button type="button" className="secondary-button" onClick={loadDesk} disabled={loading}>
          تحديث
        </button>
      </div>

      <div className="desk-toolbar panel">
        <label>
          القسم / الفئة
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">كل الأقسام</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>
        <label>
          موظف الاستقبال / المشرف
          <select value={actorStaffId} onChange={(e) => setActorStaffId(e.target.value)}>
            <option value="">—</option>
            {deskStaff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} · {person.title || ""}
              </option>
            ))}
          </select>
        </label>
        <div className="desk-counts">
          <span><b>{desk?.counts?.waiting ?? 0}</b> انتظار</span>
          <span><b>{desk?.counts?.active ?? 0}</b> داخل القسم</span>
          <span><b>{desk?.counts?.done ?? 0}</b> مكتمل</span>
        </div>
      </div>

      {error ? <div className="plan-warning">{error}</div> : null}

      <div className="desk-grid">
        <section className="panel desk-zone">
          <div className="dir-zone-head">
            <b>QR Code Scanner</b>
            <small>{desk?.date || ""}</small>
          </div>
          <QrCodeScanner busy={checkInBusy} onScan={doCheckIn} />
        </section>

        <section className="panel desk-zone">
          <div className="dir-zone-head">
            <b>زيارة نشطة</b>
            {activeVisit ? <small>{statusLabel(activeVisit.status)}</small> : null}
          </div>
          {!activeVisit ? (
            <div className="empty-state">لا يوجد عميل داخل القسم حالياً — امسح بطاقة الحضور</div>
          ) : (
            <div className="desk-active">
              <div className="desk-active-head">
                <strong>{activeVisit.customerName}</strong>
                <span>{activeVisit.serviceName}</span>
                <span>{activeVisit.time} · {activeVisit.staffName}</span>
                <span className="desk-amount">{formatMoney(activeVisit.amount || 0, locale)}</span>
              </div>
              <div className="desk-visit-meta">
                <span>مدة الخدمات: {activeVisit.visitDurationMinutes || activeVisit.durationMinutes || "—"} د</span>
                <span className={activeVisit.autoEndDue || (activeVisit.expectedEndAt && Date.parse(activeVisit.expectedEndAt) <= nowTick) ? "desk-timer due" : "desk-timer"}>
                  {remainingLabel(activeVisit) || "—"}
                </span>
                {activeVisit.pricingPending ? <span className="desk-price-pending">بانتظار تسعير نهائي</span> : null}
              </div>
              <ul className="desk-lines">
                {(activeVisit.lineItems || []).map((line) => (
                  <li key={line.id} className={line.needsFinalPrice ? "needs-price" : ""}>
                    <div className="desk-line-main">
                      <span>{line.kind === "addon" ? "＋" : "●"} {line.name}</span>
                      <em className="desk-line-tag">{pricingTypeLabel(line.pricingType)}</em>
                      {line.durationMinutes ? <small>{line.durationMinutes} د</small> : null}
                    </div>
                    {line.needsFinalPrice ? (
                      <div className="desk-line-price-edit">
                        <input
                          type="number"
                          min={line.pricingType === "range" ? line.priceMin : 0}
                          max={line.pricingType === "range" ? line.priceMax : undefined}
                          placeholder={lineAmountHint(line) || "السعر"}
                          value={priceDraft[line.id] ?? ""}
                          onChange={(e) => setPriceDraft((prev) => ({ ...prev, [line.id]: e.target.value }))}
                        />
                        <button type="button" className="ghost-button" onClick={() => saveLiveLinePrice(line)}>
                          تثبيت
                        </button>
                      </div>
                    ) : (
                      <b>{formatMoney(line.amount || 0, locale)}</b>
                    )}
                  </li>
                ))}
              </ul>
              <div className="desk-active-actions">
                <button type="button" className="edit-button" onClick={() => setAddonOpen(true)}>+ إضافة خدمة</button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => openCompleteReport(activeVisit, { auto: false })}
                >
                  إنهاء الزيارة
                </button>
              </div>
              {(desk?.active || []).length > 1 ? (
                <div className="desk-active-switch">
                  {(desk.active || []).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={item.id === activeVisit.id ? "chip on" : "chip"}
                      onClick={() => setActiveId(item.id)}
                    >
                      {item.customerName}
                      {item.autoEndDue || (item.expectedEndAt && Date.parse(item.expectedEndAt) <= nowTick) ? " · انتهى" : ""}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </section>

        <section className="panel desk-zone desk-queue">
          <div className="dir-zone-head"><b>قائمة اليوم</b></div>
          <div className="desk-queue-list">
            {(desk?.appointments || []).map((item) => (
              <button
                key={item.id}
                type="button"
                className={`desk-queue-row status-${item.status}`}
                onClick={() => {
                  if (item.status === "checked_in") setActiveId(item.id);
                }}
              >
                <span>{item.time}</span>
                <span>{item.customerName}</span>
                <span>{item.serviceName}</span>
                <em>{statusLabel(item.status)}</em>
              </button>
            ))}
            {!desk?.appointments?.length && !loading ? (
              <div className="empty-state">لا مواعيد لهذا اليوم في القسم</div>
            ) : null}
          </div>
        </section>
      </div>

      {review && reviewForm ? (
        <div className="desk-modal-backdrop" role="presentation">
          <div className="desk-modal panel" role="dialog" aria-labelledby="desk-review-title">
            <header>
              <h3 id="desk-review-title">تأكيد حضور من QR</h3>
              <button type="button" className="ghost-button" onClick={() => { setReview(null); setReviewForm(null); }}>إلغاء</button>
            </header>
            <p className="notice-inline">
              تم ضبط فئة الشاشة على حجز الرمز. راجع البيانات ثم أكّد، أو عدّلها قبل التسجيل.
              {review.sameDay ? "" : ` تنبيه: الموعد ليس اليوم (${review.today}).`}
            </p>
            <label>اسم العميل
              <input value={reviewForm.customerName} onChange={(e) => setReviewForm({ ...reviewForm, customerName: e.target.value })} />
            </label>
            <label>فئة الخدمة
              <select
                value={reviewForm.categoryId}
                onChange={(e) => {
                  const nextCategory = e.target.value;
                  const nextService = (ops?.services || []).find((service) => service.categoryId === nextCategory && service.active !== false);
                  const providers = nextService?.providerIds || [];
                  setReviewForm({
                    ...reviewForm,
                    categoryId: nextCategory,
                    serviceId: nextService?.id || "",
                    staffId: providers.includes(reviewForm.staffId) ? reviewForm.staffId : (providers[0] || "")
                  });
                  setCategoryId(nextCategory);
                }}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
            <label>الخدمة المحجوزة
              <select
                value={reviewForm.serviceId}
                onChange={(e) => {
                  const service = (ops?.services || []).find((item) => item.id === e.target.value);
                  const providers = service?.providerIds || [];
                  setReviewForm({
                    ...reviewForm,
                    serviceId: e.target.value,
                    categoryId: service?.categoryId || reviewForm.categoryId,
                    staffId: providers.includes(reviewForm.staffId) ? reviewForm.staffId : (providers[0] || "")
                  });
                  if (service?.categoryId) setCategoryId(service.categoryId);
                }}
              >
                {(ops?.services || [])
                  .filter((service) => service.categoryId === reviewForm.categoryId && service.active !== false)
                  .map((service) => (
                    <option key={service.id} value={service.id}>{service.name}</option>
                  ))}
              </select>
            </label>
            <label>مقدم الخدمة
              <select
                value={reviewForm.staffId}
                onChange={(e) => setReviewForm({ ...reviewForm, staffId: e.target.value })}
              >
                {((ops?.services || []).find((service) => service.id === reviewForm.serviceId)?.providerIds || [])
                  .map((id) => (ops?.staff || []).find((person) => person.id === id))
                  .filter(Boolean)
                  .map((person) => (
                    <option key={person.id} value={person.id}>{person.name} · {person.title || ""}</option>
                  ))}
              </select>
            </label>
            <div className="form-row">
              <label>التاريخ
                <input type="date" value={reviewForm.date} onChange={(e) => setReviewForm({ ...reviewForm, date: e.target.value })} />
              </label>
              <label>الوقت
                <input type="time" value={reviewForm.time} onChange={(e) => setReviewForm({ ...reviewForm, time: e.target.value })} />
              </label>
            </div>
            <label>المبلغ {review.appointment?.paymentStatus === "paid" ? "المدفوع" : "المسجّل"}
              <input
                type="number"
                min="0"
                value={reviewForm.amount}
                onChange={(e) => setReviewForm({ ...reviewForm, amount: e.target.value })}
              />
            </label>
            <div className="desk-active-actions">
              <button type="button" className="primary-button" disabled={checkInBusy} onClick={confirmCheckIn}>
                تأكيد تسجيل الحضور
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {addonOpen && activeVisit ? (
        <div className="desk-modal-backdrop" role="presentation" onClick={() => setAddonOpen(false)}>
          <div className="desk-modal panel" role="dialog" onClick={(e) => e.stopPropagation()}>
            <header>
              <h3>إضافة خدمة — {activeVisit.customerName}</h3>
              <button type="button" className="ghost-button" onClick={() => setAddonOpen(false)}>✕</button>
            </header>
            <p className="muted">خدمات قسم «{categories.find((c) => c.id === categoryId)?.name || "الحالي"}» فقط — تُحدَّث قائمة الزيارة فوراً</p>
            <div className="desk-addon-list">
              {categoryServices
                .filter((service) => service.id !== activeVisit.serviceId)
                .map((service) => (
                  <button
                    key={service.id}
                    type="button"
                    className="desk-addon-row"
                    onClick={() => addAddon(service.id)}
                  >
                    <span>{service.name}</span>
                    <b>
                      {service.pricingType === "on_request"
                        ? "عند الطلب"
                        : service.pricingType === "range"
                          ? `${service.priceMin}–${service.priceMax}`
                          : service.pricingType === "free"
                            ? "مجاني"
                            : formatMoney(service.price || 0, locale)}
                    </b>
                  </button>
                ))}
              {!categoryServices.length ? <div className="empty-state">لا خدمات في هذا القسم</div> : null}
            </div>
          </div>
        </div>
      ) : null}

      {completeOpen && activeVisit ? (
        <div className="desk-modal-backdrop" role="presentation">
          <div className="desk-modal panel desk-complete-modal" role="dialog" aria-labelledby="desk-complete-title">
            <header>
              <h3 id="desk-complete-title">
                {completeAuto ? "انتهت مدة الجلسة — تقرير التسعير" : "تقرير إنهاء الجلسة"}
              </h3>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setCompleteOpen(false);
                  setCompleteAuto(false);
                }}
              >
                لاحقاً
              </button>
            </header>
            {completeAuto ? (
              <p className="notice-inline">
                اكتملت المدة المحسوبة لخدمات الزيارة. راجع القائمة وثبّت أسعار النطاق / عند الطلب ثم أكّد الإنهاء.
              </p>
            ) : (
              <p className="muted">
                قائمة كل الخدمات المقدَّمة في الجلسة. أدخل السعر النهائي يدوياً للخدمات ذات النطاق أو عند الطلب.
              </p>
            )}
            <div className="desk-report-list">
              {(activeVisit.lineItems || []).map((line) => (
                <div key={line.id} className={`desk-report-row ${line.needsFinalPrice ? "needs-price" : ""}`}>
                  <div>
                    <strong>{line.name}</strong>
                    <small>
                      {line.kind === "addon" ? "إضافية" : "أساسية"} · {pricingTypeLabel(line.pricingType)}
                      {line.durationMinutes ? ` · ${line.durationMinutes} د` : ""}
                    </small>
                  </div>
                  {line.needsFinalPrice || line.pricingType === "range" || line.pricingType === "on_request" ? (
                    <label>
                      السعر النهائي
                      <input
                        type="number"
                        min={line.pricingType === "range" ? line.priceMin : 0}
                        max={line.pricingType === "range" ? line.priceMax : undefined}
                        value={priceDraft[line.id] ?? ""}
                        onChange={(e) => setPriceDraft((prev) => ({ ...prev, [line.id]: e.target.value }))}
                        placeholder={lineAmountHint(line) || ""}
                      />
                    </label>
                  ) : (
                    <b>{formatMoney(line.amount || 0, locale)}</b>
                  )}
                </div>
              ))}
            </div>
            <div className="desk-report-total">
              <span>الإجمالي</span>
              <strong>{formatMoney(reportTotal, locale)}</strong>
            </div>
            <label>
              ملاحظات الإنهاء
              <input
                value={completeNotes}
                onChange={(e) => setCompleteNotes(e.target.value)}
                placeholder="اختياري"
              />
            </label>
            <div className="desk-active-actions">
              <button type="button" className="primary-button" disabled={completeBusy} onClick={submitComplete}>
                {completeBusy ? "جارٍ الإنهاء…" : "تأكيد إنهاء الجلسة"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
