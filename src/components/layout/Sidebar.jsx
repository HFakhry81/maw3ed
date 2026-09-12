import React from 'react';

export default function Sidebar({ currentView, onViewChange, industryMode, onIndustryModeChange }) {
  const navItems = [
    { section: 'main', label: 'الرئيسية' },
    { id: 'dashboard', icon: '⌂', label: 'لوحة التحكم' },
    { id: 'calendar', icon: '▦', label: 'التقويم', badge: '3' },
    { id: 'appointments', icon: '◷', label: 'المواعيد' },

    { section: 'hospital', label: 'تشغيل المستشفى' },
    { id: 'customers', icon: '♙', label: 'المرضى' },
    { id: 'services', icon: '✦', label: 'الأقسام والعيادات' },
    { id: 'team', icon: '♧', label: 'الأطباء والطاقم' },

    { section: 'admin', label: 'الإدارة والتحليل' },
    { id: 'reports', icon: '▥', label: 'التقارير' },
    { id: 'settings', icon: '⚙', label: 'الإعدادات' },
    { id: 'plans', icon: '★', label: 'الخطط والاشتراكات' },
    { id: 'admin', icon: '🛡', label: 'إدارة المنصة' }
  ];

  return (
    <aside className="sidebar" aria-label="القائمة الرئيسية">
      <div className="brand" onClick={() => onViewChange('dashboard')}>
        <img className="brand-mark" src="/assets/maw3ed-icon.svg" alt="أيقونة موعد Maw3ed" />
        <div className="brand-name">
          <strong>موعد</strong>
          <span>برنامج من UpNexa-eg.com</span>
        </div>
      </div>

      <div className="workspace-switcher">
        <div className="workspace-avatar">س</div>
        <div className="workspace-copy">
          <b>مستشفى الشفاء</b>
          <span>منصة إدارة المواعيد الطبية</span>
        </div>
        <select
          className="industry-mode"
          value={industryMode}
          onChange={(e) => onIndustryModeChange(e.target.value)}
          aria-label="نوع النشاط"
        >
          <option value="medical">طبي</option>
          <option value="flexible">مرن</option>
        </select>
      </div>

      <nav className="main-nav">
        {navItems.map((item, index) => {
          if (item.section) {
            return (
              <p
                key={item.section}
                className={`nav-label ${index > 0 ? 'nav-label-spaced' : ''}`}
              >
                {item.label}
              </p>
            );
          }

          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onViewChange(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.badge && <i className="nav-badge">{item.badge}</i>}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-bottom">
        <div className="upgrade-card">
          <div className="upgrade-orb">✦</div>
          <b>قالب طبي مرن</b>
          <p>خصص الأقسام والخدمات ليتوافق مع طريقة عملك.</p>
          <button onClick={() => onViewChange('plans')}>
            إدارة التخصيص <span>←</span>
          </button>
        </div>
        <div className="sidebar-user">
          <div className="user-avatar">س</div>
          <div>
            <b>د. سارة أحمد</b>
            <span>مديرة التشغيل الطبي</span>
          </div>
          <button className="more-button" aria-label="المزيد" onClick={() => onViewChange('settings')}>
            •••
          </button>
        </div>
      </div>
    </aside>
  );
}
