import React, { useState } from 'react';

export default function SettingsView({ onShowToast }) {
  const [hospitalName, setHospitalName] = useState('مستشفى الشفاء');
  const [email, setEmail] = useState('contact@upnexa-eg.com');
  const [workingDays, setWorkingDays] = useState('السبت - الخميس');

  const handleSave = (e) => {
    e.preventDefault();
    onShowToast('تم حفظ الإعدادات', 'تم تحديث بيانات المنشأة بنجاح.');
  };

  return (
    <div className="panel" style={{ padding: '28px', maxWidth: '650px' }}>
      <h2 style={{ fontSize: '18px', color: 'var(--navy)', marginBottom: '4px' }}>إعدادات المنشأة</h2>
      <p style={{ color: '#8d99ad', fontSize: '11px', marginBottom: '24px' }}>
        تخصيص الهوية والبريد وساعات العمل لمنصة Maw3ed
      </p>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', fontWeight: '700', color: '#4a5b78' }}>
          اسم المنشأة الطبية
          <input
            type="text"
            value={hospitalName}
            onChange={(e) => setHospitalName(e.target.value)}
            style={{ border: '1px solid #dce5f2', borderRadius: '8px', padding: '10px', fontSize: '12px' }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', fontWeight: '700', color: '#4a5b78' }}>
          البريد الإلكتروني للإشعارات
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ border: '1px solid #dce5f2', borderRadius: '8px', padding: '10px', fontSize: '12px' }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', fontWeight: '700', color: '#4a5b78' }}>
          أيام وساعات العمل
          <input
            type="text"
            value={workingDays}
            onChange={(e) => setWorkingDays(e.target.value)}
            style={{ border: '1px solid #dce5f2', borderRadius: '8px', padding: '10px', fontSize: '12px' }}
          />
        </label>

        <div style={{ marginTop: '10px' }}>
          <button className="primary-button" type="submit">
            حفظ التعديلات <span>✓</span>
          </button>
        </div>
      </form>
    </div>
  );
}
