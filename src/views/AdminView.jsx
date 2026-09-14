import React, { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function AdminView({ onShowToast }) {
  const [overview, setOverview] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [plans, setPlans] = useState([]);
  const [audit, setAudit] = useState([]);
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  const loadData = async () => {
    try {
      const [ovRes, wsRes, subRes, plRes, auRes] = await Promise.all([
        api.getAdminOverview().catch(() => ({ metrics: { users: 0, workspaces: 0, subscriptions: [] } })),
        api.getAdminWorkspaces().catch(() => ({ workspaces: [] })),
        api.getAdminSubscriptions().catch(() => ({ subscriptions: [] })),
        api.getAdminPlans().catch(() => ({ plans: [] })),
        api.getAdminAudit().catch(() => ({ events: [] }))
      ]);

      setOverview(ovRes);
      setWorkspaces(wsRes.workspaces || []);
      setSubscriptions(subRes.subscriptions || []);
      setPlans(plRes.plans || []);
      setAudit(auRes.events || []);

      const pMap = {};
      (plRes.plans || []).forEach((p) => {
        pMap[p.plan_key] = p.price_usd;
      });
      setPrices(pMap);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleUpdateSubscription = async (id, status) => {
    try {
      await api.updateAdminSubscription(id, status);
      onShowToast('تم تحديث الاشتراك', `تم ضبط الحالة إلى ${status === 'active' ? 'مفعل' : 'مرفوض'}`);
      loadData();
    } catch (err) {
      onShowToast('خطأ', err.message);
    }
  };

  const handleSavePlanPrice = async (planKey) => {
    try {
      const price = parseFloat(prices[planKey]);
      if (isNaN(price) || price < 0) {
        setNotice('يرجى إدخال سعر صالح');
        return;
      }
      await api.updateAdminPlan(planKey, price);
      setNotice('تم تحديث سعر الخطة بنجاح.');
      onShowToast('تم تحديث السعر', `الخطة ${planKey}: $${price}`);
      loadData();
    } catch (err) {
      setNotice(err.message || 'تعذر تحديث السعر.');
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '50px', color: '#8d99ad' }}>جارٍ تحميل لوحة مسؤولي المنصة...</div>;
  }

  const metrics = overview?.metrics || { users: 1, workspaces: 1, subscriptions: [] };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '20px', color: 'var(--navy)' }}>لوحة مسؤولي منصة Maw3ed</h2>
          <p style={{ color: '#8d99ad', fontSize: '11px', marginTop: '3px' }}>
            UpNexa-eg.com · إدارة الحسابات، طلبات الاشتراكات، والأسعار
          </p>
        </div>
        <span className="pill active">مسؤول منصة</span>
      </div>

      {/* Metrics */}
      <div className="admin-grid">
        <article className="admin-metric">
          <span>الحسابات النشطة</span>
          <strong>{metrics.users}</strong>
        </article>
        <article className="admin-metric">
          <span>مساحات العمل</span>
          <strong>{metrics.workspaces}</strong>
        </article>
        {(metrics.subscriptions || []).map((sub) => (
          <article key={sub.plan_key} className="admin-metric">
            <span>اشتراكات {sub.plan_key}</span>
            <strong>{sub.count}</strong>
          </article>
        ))}
      </div>

      {/* Panels: Subscriptions & Plans */}
      <div className="admin-panels">
        <section className="panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '15px', color: 'var(--navy)', marginBottom: '14px' }}>طلبات الاشتراك المعلقة</h3>
          {subscriptions.length === 0 ? (
            <div className="empty-state">لا توجد طلبات اشتراك حالياً.</div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>المؤسسة</th>
                  <th>الخطة</th>
                  <th>الحالة</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.workspace_name}</strong>
                      <br />
                      <small style={{ color: '#8d99ad' }}>{s.owner_email}</small>
                    </td>
                    <td>{s.plan_key}</td>
                    <td>
                      <span className={`pill ${s.status === 'pending' ? 'pending' : 'active'}`}>
                        {s.status === 'pending' ? 'بانتظار الموافقة' : s.status}
                      </span>
                    </td>
                    <td>
                      {s.status === 'pending' && (
                        <>
                          <button
                            className="btn-action"
                            onClick={() => handleUpdateSubscription(s.id, 'active')}
                          >
                            موافقة
                          </button>
                          <button
                            className="btn-action reject"
                            onClick={() => handleUpdateSubscription(s.id, 'rejected')}
                          >
                            رفض
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '15px', color: 'var(--navy)', marginBottom: '14px' }}>خطط المنصة والأسعار</h3>
          <div>
            {plans.map((plan) => (
              <div key={plan.plan_key} className="plan-edit-row">
                <strong>{plan.display_name}</strong>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={prices[plan.plan_key] ?? plan.price_usd}
                  onChange={(e) =>
                    setPrices({ ...prices, [plan.plan_key]: e.target.value })
                  }
                />
                <button
                  className="btn-action"
                  onClick={() => handleSavePlanPrice(plan.plan_key)}
                >
                  حفظ
                </button>
              </div>
            ))}
          </div>
          {notice && (
            <p style={{ color: '#1769e8', fontSize: '11px', marginTop: '10px' }}>{notice}</p>
          )}
        </section>
      </div>

      {/* Panels: Workspaces & Audit */}
      <div className="admin-panels">
        <section className="panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '15px', color: 'var(--navy)', marginBottom: '14px' }}>مساحات العمل المسجلة</h3>
          {workspaces.length === 0 ? (
            <div className="empty-state">لا توجد مساحات عمل مسجلة.</div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>النشاط</th>
                  <th>المالك</th>
                  <th>الخطة</th>
                </tr>
              </thead>
              <tbody>
                {workspaces.map((w) => (
                  <tr key={w.id}>
                    <td><strong>{w.name}</strong></td>
                    <td>{w.activity_type}</td>
                    <td>{w.owner_email}</td>
                    <td><span className="pill">{w.plan_key}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '15px', color: 'var(--navy)', marginBottom: '14px' }}>سجل أحداث المنصة (Audit)</h3>
          <div className="audit-list">
            {audit.length === 0 ? (
              <div className="empty-state">لا توجد أحداث مسجلة بعد.</div>
            ) : (
              audit.slice(0, 30).map((ev) => (
                <div key={ev.id} className="audit-item">
                  <strong>{ev.action}</strong> • <small>{ev.actor_email || 'system'}</small>
                  <br />
                  <span style={{ fontSize: '9px', color: '#9aa5b8' }}>
                    {new Date(ev.created_at).toLocaleString('ar-EG')}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
