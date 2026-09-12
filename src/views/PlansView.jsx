import React, { useEffect, useState } from 'react';
import { api, trackEvent } from '../../api/client';

const featureLabels = {
  public_booking: 'صفحة حجز عامة للمرضى',
  basic_dashboard: 'لوحة تحكم طبية متكاملة',
  email_verification: 'التحقق الآمن من البريد',
  analytics: 'تحليلات ومؤشرات أداء متقدمة',
  reminders: 'تذكيرات المواعيد التلقائية',
  custom_branding: 'هوية مخصصة باسم المنشأة',
  api_access: 'وصول مباشر لواجهات برمجة التطبيقات API',
  advanced_roles: 'صلاحيات متقدمة (طبيب، استقبال، إدارة)',
  priority_support: 'دعم فني مخصص على مدار الساعة'
};

const badgeLabels = {
  free: 'البداية المجانية',
  pro: 'الأكثر طلباً للعيادات',
  ultimate: 'للمستشفيات والمراكز'
};

export default function PlansView({ onShowToast }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [requestingPlan, setRequestingPlan] = useState(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    api.getPlans()
      .then((res) => setPlans(res.plans || []))
      .catch((err) => console.error('Failed to load plans', err))
      .finally(() => setLoading(false));
  }, []);

  const handleRequestPlan = async (planKey) => {
    setRequestingPlan(planKey);
    setNote('');

    try {
      const res = await api.requestPlan(planKey);
      trackEvent('plan_requested', { planKey });
      onShowToast('تم تقديم الطلب', res.request?.message || 'تم إرسال طلب الاشتراك للمراجعة.');
      setNote(res.request?.message || 'تم إرسال طلب الاشتراك إلى مسؤول المنصة للمراجعة.');
    } catch (err) {
      if (err.status === 401) {
        onShowToast('تسجيل الدخول مطلوب', 'يرجى تسجيل الدخول أولاً لطلب الخطة.');
        setNote('يرجى تسجيل الدخول أولاً لتفعيل الخطة.');
      } else {
        onShowToast('تعذر إرسال الطلب', err.message);
        setNote(err.message || 'حدث خطأ أثناء معالجة الطلب.');
      }
    } finally {
      setRequestingPlan(null);
    }
  };

  const money = (val) => Number(val) === 0 ? 'مجاناً' : `$${Number(val).toFixed(0)}`;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '30px' }}>
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <span className="pill active" style={{ marginBottom: '10px' }}>خطط مرنة تناسب احتياجاتك</span>
        <h1 style={{ fontSize: '32px', color: 'var(--navy)', marginTop: '8px' }}>
          اختر الخطة المناسبة لمنشأتك الطبية
        </h1>
        <p style={{ color: '#7a8ba3', fontSize: '13px', maxWidth: '580px', margin: '10px auto 0', lineHeight: '1.7' }}>
          ابدأ مجاناً مع العيادة الأولى، أو اختر خطة احترافية مع دعم التذكيرات والتقارير المتقدمة والهوية المستقلة.
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#8d99ad' }}>جارٍ تحميل الخطط...</div>
      ) : (
        <div className="plans-grid">
          {plans.map((plan) => {
            const isFeatured = plan.plan_key === 'pro';
            const isFree = plan.plan_key === 'free';
            const features = Object.entries(plan.features || {})
              .filter(([, enabled]) => enabled)
              .map(([k]) => featureLabels[k] || k);

            return (
              <article
                key={plan.plan_key}
                className={`plan-card ${isFeatured ? 'featured' : ''} ${isFree ? 'free' : ''}`}
              >
                <span className="badge">{badgeLabels[plan.plan_key] || plan.display_name}</span>
                <h2>{plan.display_name}</h2>
                <div className="plan-price">
                  {money(plan.price_usd)}
                  {Number(plan.price_usd) > 0 && <small> / شهرياً</small>}
                </div>
                <p className="plan-desc">{plan.description}</p>
                <ul className="plan-features">
                  {features.map((feat, idx) => (
                    <li key={idx}>{feat}</li>
                  ))}
                </ul>
                <button
                  className="plan-cta"
                  disabled={requestingPlan === plan.plan_key}
                  onClick={() => handleRequestPlan(plan.plan_key)}
                >
                  {requestingPlan === plan.plan_key
                    ? 'جارٍ المعالجة...'
                    : isFree
                    ? 'ابدأ مجاناً الآن'
                    : 'اطلب الاشتراك الآن'}
                </button>
              </article>
            );
          })}
        </div>
      )}

      {note && (
        <div style={{ textAlign: 'center', marginTop: '24px', color: '#1769e8', background: '#eef5ff', padding: '12px', borderRadius: '10px', fontSize: '12px' }}>
          {note}
        </div>
      )}
    </div>
  );
}
