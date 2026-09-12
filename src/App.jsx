import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/layout/Sidebar';
import Topbar from './components/layout/Topbar';
import Footer from './components/layout/Footer';
import Toast from './components/common/Toast';
import AppointmentModal from './components/modals/AppointmentModal';
import EmailVerificationModal from './components/modals/EmailVerificationModal';

import DashboardView from './views/DashboardView';
import CalendarView from './views/CalendarView';
import AppointmentsView from './views/AppointmentsView';
import PatientsView from './views/PatientsView';
import ServicesView from './views/ServicesView';
import TeamView from './views/TeamView';
import ReportsView from './views/ReportsView';
import SettingsView from './views/SettingsView';
import AdminView from './views/AdminView';
import PlansView from './views/PlansView';
import AuthView from './views/AuthView';

import { api, trackEvent } from './api/client';

const rtlLanguages = new Set(['ar', 'ur']);

export default function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [industryMode, setIndustryMode] = useState('medical');
  const [language, setLanguage] = useState('ar');
  const [dashboardData, setDashboardData] = useState(null);
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [toast, setToast] = useState({ show: false, title: '', message: '' });

  const showToast = useCallback((title, message) => {
    setToast({ show: true, title, message });
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 3200);
  }, []);

  const loadDashboard = useCallback(async () => {
    try {
      const data = await api.getDashboard('2025-05-14');
      setDashboardData(data);
    } catch (err) {
      console.warn('Could not load dashboard data from API', err);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    trackEvent('page_loaded', { view: 'dashboard', language, mode: industryMode });
  }, [loadDashboard, language, industryMode]);

  const handleLanguageChange = (lang, source = 'اللغة المختارة') => {
    setLanguage(lang);
    const dir = rtlLanguages.has(lang) ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    showToast(`تم تفعيل اللغة: ${lang}`, `${source} — تم ضبط اتجاه الواجهة تلقائياً.`);
    trackEvent('language_changed', { language: lang, direction: dir, source });
  };

  const handleDetectLanguage = () => {
    const browserLang = (navigator.language || 'ar').toLowerCase().split('-')[0];
    handleLanguageChange(browserLang, 'اكتشاف لغة المتصفح');
  };

  const handleIndustryModeChange = (mode) => {
    setIndustryMode(mode);
    const isMedical = mode === 'medical';
    showToast(
      isMedical ? 'تم تفعيل القالب الطبي' : 'تم تفعيل الوضع المرن',
      isMedical ? 'الأقسام والخدمات جاهزة للتشغيل الطبي.' : 'يمكنك تخصيص الحقول لأي نشاط حجز.'
    );
    trackEvent('industry_mode_changed', { mode });
  };

  const handleAppointmentSuccess = (newAppt) => {
    showToast('تم حفظ الموعد بنجاح', 'تمت إضافة الموعد إلى الجدول الطبي.');
    loadDashboard();
  };

  return (
    <div className="app-shell">
      <Sidebar
        currentView={currentView}
        onViewChange={(v) => {
          setCurrentView(v);
          trackEvent('view_changed', { view: v });
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        industryMode={industryMode}
        onIndustryModeChange={handleIndustryModeChange}
      />

      <main className="main-content">
        <Topbar
          currentView={currentView}
          onOpenEmailVerification={() => setIsEmailModalOpen(true)}
          onShowToast={showToast}
        />

        <div className="page-wrap">
          {currentView === 'dashboard' && (
            <DashboardView
              dashboardData={dashboardData}
              onOpenNewAppointment={() => setIsAppointmentModalOpen(true)}
              onViewChange={setCurrentView}
              currentLanguage={language}
              onLanguageChange={handleLanguageChange}
              onDetectLanguage={handleDetectLanguage}
              onShowToast={showToast}
            />
          )}

          {currentView === 'calendar' && (
            <CalendarView
              onViewChange={setCurrentView}
              onOpenNewAppointment={() => setIsAppointmentModalOpen(true)}
            />
          )}

          {currentView === 'appointments' && (
            <AppointmentsView
              appointments={dashboardData?.appointments || []}
              onOpenNewAppointment={() => setIsAppointmentModalOpen(true)}
            />
          )}

          {currentView === 'customers' && <PatientsView />}

          {currentView === 'services' && <ServicesView />}

          {currentView === 'team' && <TeamView />}

          {currentView === 'reports' && (
            <ReportsView dashboardData={dashboardData} />
          )}

          {currentView === 'settings' && (
            <SettingsView onShowToast={showToast} />
          )}

          {currentView === 'plans' && (
            <PlansView onShowToast={showToast} />
          )}

          {currentView === 'admin' && (
            <AdminView onShowToast={showToast} />
          )}

          {currentView === 'auth' && (
            <AuthView
              onOpenEmailVerification={() => setIsEmailModalOpen(true)}
              onShowToast={showToast}
              onViewChange={setCurrentView}
            />
          )}
        </div>

        <Footer />
      </main>

      {/* Modals */}
      <AppointmentModal
        isOpen={isAppointmentModalOpen}
        onClose={() => setIsAppointmentModalOpen(false)}
        onSuccess={handleAppointmentSuccess}
        departments={dashboardData?.departments || []}
        doctors={dashboardData?.doctors || []}
      />

      <EmailVerificationModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        onShowToast={showToast}
      />

      {/* Toast Notification */}
      <Toast toast={toast} />
    </div>
  );
}
