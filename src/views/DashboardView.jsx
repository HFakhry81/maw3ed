import React, { useState } from 'react';

const arabicDigits = (val) => String(val ?? '').replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);

const appointmentColors = ['green', 'blue', 'yellow', 'purple'];
const avatarColors = ['pink', 'peach', 'lavender', 'mint'];

const languages = [
  { code: 'ar', name: 'العربية — الأكثر استخداماً' },
  { code: 'en', name: 'English — Global' },
  { code: 'fr', name: 'Français — Français' },
  { code: 'ur', name: 'اردو — اردو' },
  { code: 'tr', name: 'Türkçe — Türkçe' },
  { code: 'es', name: 'Español — Español' },
  { code: 'hi', name: 'हिन्दी — हिन्दी' },
  { code: 'bn', name: 'বাংলা — বাংলা' },
  { code: 'de', name: 'Deutsch — Deutsch' },
  { code: 'pt', name: 'Português — Português' },
  { code: 'ru', name: 'Русский — Русский' },
  { code: 'zh', name: '中文 — 简体中文' },
  { code: 'ja', name: '日本語 — 日本語' },
  { code: 'ko', name: '한국어 — 한국어' },
  { code: 'id', name: 'Bahasa Indonesia — Bahasa' }
];

export default function DashboardView({
  dashboardData,
  onOpenNewAppointment,
  onViewChange,
  currentLanguage,
  onLanguageChange,
  onDetectLanguage,
  onShowToast
}) {
  const [selectedDept, setSelectedDept] = useState('all');
  const [weekOffset, setWeekOffset] = useState(0);

  const stats = dashboardData?.stats || {
    appointmentsToday: 48,
    newPatients: 32,
    completedExams: 128,
    attendanceRate: 96
  };

  const appointments = dashboardData?.appointments || [];
  const departments = dashboardData?.departments || [];

  const handlePrevWeek = () => {
    setWeekOffset(prev => prev - 1);
    onShowToast('الأسبوع السابق', 'يتم عرض مواعيد الأسبوع السابق.');
  };

  const handleNextWeek = () => {
    setWeekOffset(prev => prev + 1);
    onShowToast('الأسبوع التالي', 'يتم عرض مواعيد الأسبوع التالي.');
  };

  return (
    <div>
      {/* Welcome Row */}
      <div className="welcome-row">
        <div>
          <div className="eyebrow">
            <span className="live-dot"></span> نموذج طبي قابل للتخصيص
          </div>
          <h1>صباح الخير، د. سارة <span className="wave">✦</span></h1>
          <p className="page-subtitle">إليك ملخص العمل الطبي في مستشفى الشفاء لهذا اليوم.</p>
        </div>
        <button className="primary-button" onClick={onOpenNewAppointment}>
          <span>＋</span> موعد جديد
        </button>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <article className="stat-card">
          <div className="stat-card-head">
            <span>مواعيد اليوم</span>
            <div className="stat-icon blue">◷</div>
          </div>
          <div className="stat-value">{arabicDigits(stats.appointmentsToday)}</div>
          <div className="stat-foot positive">
            <span>↑ ١٢٪</span>
            <em>مقارنة بالأسبوع الماضي</em>
          </div>
          <div className="sparkline blue-line">
            <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
          </div>
        </article>

        <article className="stat-card">
          <div className="stat-card-head">
            <span>مرضى جدد</span>
            <div className="stat-icon yellow">♙</div>
          </div>
          <div className="stat-value">{arabicDigits(stats.newPatients)}</div>
          <div className="stat-foot positive">
            <span>↑ ٨.٤٪</span>
            <em>مقارنة بالأسبوع الماضي</em>
          </div>
          <div className="sparkline yellow-line">
            <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
          </div>
        </article>

        <article className="stat-card">
          <div className="stat-card-head">
            <span>فحوصات مكتملة</span>
            <div className="stat-icon purple">✚</div>
          </div>
          <div className="stat-value">{arabicDigits(stats.completedExams)}</div>
          <div className="stat-foot positive">
            <span>↑ ٢٤٪</span>
            <em>مقارنة بالأسبوع الماضي</em>
          </div>
          <div className="sparkline purple-line">
            <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
          </div>
        </article>

        <article className="stat-card">
          <div className="stat-card-head">
            <span>نسبة الحضور</span>
            <div className="stat-icon green">✓</div>
          </div>
          <div className="stat-value">
            {arabicDigits(stats.attendanceRate)}<span className="percent">٪</span>
          </div>
          <div className="stat-foot positive">
            <span>↑ ٣.٢٪</span>
            <em>مقارنة بالأسبوع الماضي</em>
          </div>
          <div className="progress-track">
            <span style={{ width: `${stats.attendanceRate}%` }}></span>
          </div>
        </article>
      </div>

      {/* Department Strip */}
      <section className="panel department-strip">
        <div className="department-copy">
          <span className="department-kicker">وحدات جاهزة للتفعيل</span>
          <h2>الأقسام التي يخدمها النظام</h2>
          <p>فعّل ما يناسب منشأتك، وأضف خدمات وأقساماً مخصصة عند الحاجة.</p>
        </div>
        <div className="department-chips">
          <button
            className={`department-chip ${selectedDept === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedDept('all')}
          >
            <i>✚</i> كافة الأقسام
          </button>
          {departments.map((dept) => (
            <button
              key={dept.id}
              className={`department-chip ${selectedDept === dept.id ? 'active' : ''}`}
              onClick={() => setSelectedDept(dept.id)}
            >
              <i>✦</i> {dept.name}
            </button>
          ))}
          <button
            className="department-chip"
            onClick={() => onViewChange('services')}
          >
            <i>＋</i> إضافة قسم
          </button>
        </div>
      </section>

      {/* Language Strip */}
      <section className="panel language-strip">
        <div className="language-copy">
          <span className="department-kicker">دعم عالمي مدمج</span>
          <h2>الدعم اللغوي الذكي</h2>
          <p>يكتشف لغة المتصفح ويضبط اتجاه الواجهة وترجمة الحقول الطبية تلقائياً.</p>
        </div>
        <div className="language-controls">
          <select
            value={currentLanguage}
            onChange={(e) => onLanguageChange(e.target.value)}
            aria-label="لغة الواجهة"
          >
            {languages.map((l) => (
              <option key={l.code} value={l.code}>{l.name}</option>
            ))}
          </select>
          <button className="secondary-button" onClick={onDetectLanguage}>
            ⌁ اكتشاف لغة المتصفح
          </button>
        </div>
        <div className="language-meta">
          <span><i className="language-status"></i> الترجمة التلقائية مفعّلة</span>
          <b>15 لغة</b>
          <span>RTL / LTR تلقائي</span>
        </div>
      </section>

      {/* Content Grid (Calendar + Today Appointments) */}
      <div className="content-grid">
        <section className="panel calendar-panel">
          <div className="panel-heading">
            <div>
              <h2>الجدول الطبي للأسبوع</h2>
              <p>مواعيد الأقسام من ١١ — ١٧ مايو ٢٠٢٥ {weekOffset !== 0 ? `(إزاحة ${weekOffset})` : ''}</p>
            </div>
            <div className="panel-actions">
              <button className="square-button" onClick={handlePrevWeek}>›</button>
              <button className="square-button" onClick={handleNextWeek}>‹</button>
              <button className="text-button" onClick={() => setWeekOffset(0)}>
                هذا الأسبوع <span>⌄</span>
              </button>
            </div>
          </div>
          <div className="week-calendar">
            <div className="week-row week-head">
              <span className="time-gutter"></span>
              <span>الأحد<small>١١</small></span>
              <span>الإثنين<small>١٢</small></span>
              <span className="today">الثلاثاء<small>١٣</small></span>
              <span>الأربعاء<small>١٤</small></span>
              <span>الخميس<small>١٥</small></span>
              <span>الجمعة<small>١٦</small></span>
              <span>السبت<small>١٧</small></span>
            </div>
            <div className="calendar-body">
              <div className="time-labels">
                <span>٠٩:٠٠</span>
                <span>١٠:٠٠</span>
                <span>١١:٠٠</span>
                <span>١٢:٠٠</span>
                <span>٠١:٠٠</span>
                <span>٠٢:٠٠</span>
                <span>٠٣:٠٠</span>
                <span>٠٤:٠٠</span>
              </div>
              <div className="day-column">
                <span className="booking b1">كشف باطني<span>ليان محمد</span></span>
                <span className="booking b2">تحاليل مخبرية<span>نور علي</span></span>
              </div>
              <div className="day-column">
                <span className="booking b3">متابعة أطفال<span>مها خالد</span></span>
              </div>
              <div className="day-column selected-day">
                <span className="booking b4">أشعة سونار<span>جود عبدالعزيز</span></span>
                <span className="booking b5">عيادة الأسنان<span>ريم سعد</span></span>
              </div>
              <div className="day-column">
                <span className="booking b6">كشف قلب<span>هدى أحمد</span></span>
              </div>
              <div className="day-column">
                <span className="booking b7">علاج طبيعي<span>رنا يوسف</span></span>
                <span className="booking b8">عيادة نساء<span>سلمى علي</span></span>
              </div>
              <div className="day-column"></div>
              <div className="day-column">
                <span className="booking b9">جلسة عناية<span>غادة فهد</span></span>
              </div>
            </div>
          </div>
        </section>

        <section className="panel today-panel">
          <div className="panel-heading">
            <div>
              <h2>مواعيد اليوم</h2>
              <p>الأربعاء، ١٤ مايو • {arabicDigits(appointments.length)} مواعيد</p>
            </div>
            <button className="round-arrow" onClick={() => onViewChange('appointments')}>←</button>
          </div>
          <div className="today-progress">
            <div>
              <span>نسبة الإنجاز</span>
              <b>٦٧٪</b>
            </div>
            <div className="progress-track">
              <span style={{ width: '67%' }}></span>
            </div>
          </div>

          <div className="appointment-list">
            {appointments.length === 0 ? (
              <div className="empty-state">لا توجد مواعيد لهذا اليوم.</div>
            ) : (
              appointments.map((appt, idx) => {
                const color = appointmentColors[idx % appointmentColors.length];
                const avatarBg = avatarColors[idx % avatarColors.length];
                const initial = (appt.patientName || '').trim().charAt(0) || 'م';

                return (
                  <div key={appt.id || idx} className="appointment-item">
                    <div className="appointment-time">
                      <b>{arabicDigits(appt.time)}</b>
                      <span>{appt.period || 'صباحاً'}</span>
                    </div>
                    <div className={`appointment-line ${color}`}></div>
                    <div className="appointment-info">
                      <b>{appt.patientName}</b>
                      <span>{appt.serviceName || appt.departmentName} • {appt.doctorName}</span>
                    </div>
                    <div className={`appointment-avatar ${avatarBg}`}>
                      {initial}
                    </div>
                    <span className={`status ${appt.status || 'pending'}`}>
                      {appt.status === 'confirmed' ? 'مؤكد' : appt.status === 'completed' ? 'مكتمل' : 'بانتظار التأكيد'}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          <button className="view-all" onClick={() => onViewChange('appointments')}>
            عرض كل المواعيد <span>←</span>
          </button>
        </section>
      </div>

      {/* Bottom Grid (Donut Chart + Patients Table) */}
      <div className="bottom-grid">
        <section className="panel service-panel">
          <div className="panel-heading">
            <div>
              <h2>الأقسام الأكثر طلباً</h2>
              <p>خلال آخر ٣٠ يوماً</p>
            </div>
            <button className="dots" onClick={() => onViewChange('reports')}>•••</button>
          </div>
          <div className="service-chart">
            <div className="donut">
              <div>
                <b>٣٨٤</b>
                <span>موعد</span>
              </div>
            </div>
            <ul className="legend">
              <li><i className="dot dot-blue"></i><span>الباطنية</span><b>٣٨٪</b></li>
              <li><i className="dot dot-yellow"></i><span>الأطفال</span><b>٢٨٪</b></li>
              <li><i className="dot dot-purple"></i><span>الأسنان</span><b>١٨٪</b></li>
              <li><i className="dot dot-soft"></i><span>أقسام أخرى</span><b>١٦٪</b></li>
            </ul>
          </div>
        </section>

        <section className="panel customers-panel">
          <div className="panel-heading">
            <div>
              <h2>مرضى جدد</h2>
              <p>آخر الملفات الطبية المضافة</p>
            </div>
            <button className="text-button" onClick={() => onViewChange('customers')}>
              عرض الكل <span>←</span>
            </button>
          </div>
          <div className="customer-table">
            <div className="customer-row table-head">
              <span>العميل</span>
              <span>تاريخ الانضمام</span>
              <span>آخر زيارة</span>
            </div>
            <div className="customer-row">
              <div className="customer-name">
                <i className="avatar coral">ن</i>
                <b>نور علي</b>
              </div>
              <span>اليوم</span>
              <span className="customer-tag">موعد أول</span>
            </div>
            <div className="customer-row">
              <div className="customer-name">
                <i className="avatar sky">م</i>
                <b>مها خالد</b>
              </div>
              <span>أمس</span>
              <span>١٣ مايو ٢٠٢٥</span>
            </div>
            <div className="customer-row">
              <div className="customer-name">
                <i className="avatar gold">غ</i>
                <b>غادة فهد</b>
              </div>
              <span>١٢ مايو</span>
              <span>١٢ مايو ٢٠٢٥</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
