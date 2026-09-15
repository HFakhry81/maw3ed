import React from 'react';

const viewTitles = {
  dashboard: 'لوحة التحكم',
  calendar: 'التقويم',
  appointments: 'المواعيد',
  customers: 'المرضى',
  services: 'الأقسام والعيادات',
  team: 'الأطباء والطاقم',
  reports: 'التقارير',
  settings: 'الإعدادات',
  plans: 'الخطط والاشتراكات',
  admin: 'إدارة المنصة'
};

export default function Topbar({ currentView, onOpenEmailVerification, onShowToast }) {
  const title = viewTitles[currentView] || 'لوحة التحكم';

  return (
    <header className="topbar">
      <div className="breadcrumb">
        <span>مساحة العمل</span>
        <b>/</b>
        <strong>{title}</strong>
      </div>

      <div className="top-actions">
        <button
          className="verify-badge"
          onClick={onOpenEmailVerification}
          title="التحقق من البريد الإلكتروني"
        >
          <span>✉</span> تحقق من البريد
        </button>

        <button
          className="icon-button notification-button"
          aria-label="الإشعارات"
          onClick={() => onShowToast('لا توجد إشعارات جديدة', 'كل شيء محدث حتى الآن.')}
        >
          <span>♧</span>
          <i></i>
        </button>

        <div className="top-divider"></div>

        <div className="top-user">
          <div className="top-user-avatar">س</div>
          <div>
            <b>مرحباً، د. سارة</b>
            <span>الأربعاء، ١٤ مايو ٢٠٢٥</span>
          </div>
        </div>
      </div>
    </header>
  );
}
