import React, { useState } from 'react';

export default function AuthView({ onOpenEmailVerification, onShowToast, onViewChange }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    onShowToast('تم تسجيل الدخول محلياً', `مرحباً بك: ${email}`);
    onViewChange('dashboard');
  };

  return (
    <div style={{ maxWidth: '440px', margin: '40px auto', padding: '20px' }}>
      <div className="panel" style={{ padding: '32px', borderRadius: '22px' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <img src="/assets/maw3ed-icon.svg" alt="Maw3ed" style={{ width: '56px', height: '56px', borderRadius: '14px', marginBottom: '12px' }} />
          <h2 style={{ fontSize: '22px', color: 'var(--navy)' }}>تسجيل الدخول — منصة موعد</h2>
          <p style={{ color: '#8d99ad', fontSize: '11px', marginTop: '4px' }}>UpNexa-eg.com</p>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', fontWeight: '700', color: '#4a5b78' }}>
            البريد الإلكتروني
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="doctor@hospital.com"
              style={{ border: '1px solid #dce5f2', borderRadius: '8px', padding: '10px', fontSize: '12px', direction: 'ltr' }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', fontWeight: '700', color: '#4a5b78' }}>
            كلمة المرور
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ border: '1px solid #dce5f2', borderRadius: '8px', padding: '10px', fontSize: '12px', direction: 'ltr' }}
            />
          </label>

          <button className="primary-button" type="submit" style={{ justifyContent: 'center', marginTop: '8px' }}>
            دخول إلى المنصة <span>←</span>
          </button>
        </form>

        <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #edf1f7', textAlign: 'center' }}>
          <button
            type="button"
            onClick={onOpenEmailVerification}
            style={{ background: 'transparent', color: '#1769e8', fontSize: '11px', fontWeight: '700' }}
          >
            ✉ توثيق الحساب عبر رمز البريد
          </button>
        </div>
      </div>
    </div>
  );
}
