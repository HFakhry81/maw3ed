import React from 'react';

export default function ReportsView({ dashboardData }) {
  const stats = dashboardData?.stats || {
    appointmentsToday: 48,
    newPatients: 32,
    completedExams: 128,
    attendanceRate: 96
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="panel" style={{ padding: '24px' }}>
        <h2 style={{ fontSize: '18px', color: 'var(--navy)' }}>المؤشرات والتقارير الطبية</h2>
        <p style={{ color: '#8d99ad', fontSize: '11px', marginTop: '4px' }}>
          تحليلات شاملة لأداء العيادات والأقسام ونسب الإنجاز
        </p>

        <div className="stats-grid" style={{ marginTop: '24px' }}>
          <article className="stat-card">
            <div className="stat-card-head"><span>إجمالي الفحوصات</span></div>
            <div className="stat-value">{stats.completedExams}</div>
            <div className="stat-foot positive"><span>↑ 24%</span><em>مقارنة بالشهر الماضي</em></div>
          </article>
          <article className="stat-card">
            <div className="stat-card-head"><span>معدل الحضور</span></div>
            <div className="stat-value">{stats.attendanceRate}%</div>
            <div className="stat-foot positive"><span>↑ 3.2%</span><em>نسبة التزام المرضى</em></div>
          </article>
          <article className="stat-card">
            <div className="stat-card-head"><span>مرضى جدد هذا الشهر</span></div>
            <div className="stat-value">{stats.newPatients}</div>
            <div className="stat-foot positive"><span>↑ 14%</span><em>نمو الملفات الطبية</em></div>
          </article>
          <article className="stat-card">
            <div className="stat-card-head"><span>متوسط الانتظار</span></div>
            <div className="stat-value">12 <small>دقيقة</small></div>
            <div className="stat-foot positive"><span>↓ 18%</span><em>تحسن ملحوظ</em></div>
          </article>
        </div>
      </div>

      <div className="bottom-grid">
        <section className="panel service-panel">
          <div className="panel-heading">
            <div>
              <h2>توزيع المواعيد حسب التخصص</h2>
              <p>آخر 30 يوماً</p>
            </div>
          </div>
          <div className="service-chart">
            <div className="donut">
              <div>
                <b>384</b>
                <span>موعد</span>
              </div>
            </div>
            <ul className="legend">
              <li><i className="dot dot-blue"></i><span>الباطنية</span><b>38%</b></li>
              <li><i className="dot dot-yellow"></i><span>الأطفال</span><b>28%</b></li>
              <li><i className="dot dot-purple"></i><span>الأسنان</span><b>18%</b></li>
              <li><i className="dot dot-soft"></i><span>أقسام أخرى</span><b>16%</b></li>
            </ul>
          </div>
        </section>

        <section className="panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '14px', color: 'var(--navy)', marginBottom: '10px' }}>مؤشرات الجودة</h3>
          <p style={{ color: '#8d99ad', fontSize: '11px', marginBottom: '16px' }}>
            تقييمات رضاء المرضى وسرعة إتمام الكشوفات
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                <span>رضاء المرضى عن الخدمة</span>
                <b>98%</b>
              </div>
              <div className="progress-track"><span style={{ width: '98%' }}></span></div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                <span>الالتزام بمواعيد الكشف</span>
                <b>92%</b>
              </div>
              <div className="progress-track"><span style={{ width: '92%' }}></span></div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
