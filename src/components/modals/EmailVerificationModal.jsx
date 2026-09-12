import React, { useState } from 'react';
import { api, trackEvent } from '../../api/client';

export default function EmailVerificationModal({ isOpen, onClose, onVerified, onShowToast }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('request'); // 'request' | 'verify'
  const [devCode, setDevCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleRequestCode = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await api.requestVerification(email, document.documentElement.lang || 'ar');
      if (res.devCode) {
        setDevCode(res.devCode);
      }
      setStep('verify');
      onShowToast('تم إرسال رمز التحقق', 'تحقق من بريدك وأدخل الرمز المكون من 6 أرقام.');
      trackEvent('email_verification_requested', { delivery: res.delivery });
    } catch (err) {
      setError(err.message || 'تعذر إرسال رمز التحقق');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await api.verifyEmail(email, code);
      onShowToast('تم توثيق البريد', 'أصبح البريد جاهزاً وموثقاً بنجاح.');
      trackEvent('email_verified');
      if (onVerified) onVerified(email);
      onClose();
      // Reset
      setStep('request');
      setCode('');
      setDevCode('');
    } catch (err) {
      setError(err.message || 'رمز التحقق غير صحيح أو انتهت صلاحيته');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal email-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="modal-close" onClick={onClose} aria-label="إغلاق">×</button>
        <div className="modal-kicker">حماية الحساب</div>
        <h2>تحقق من بريدك الإلكتروني</h2>
        <p>نرسل رمزاً مؤقتاً من 6 أرقام لتأكيد ملكية البريد قبل تفعيل الحساب.</p>

        {error && (
          <div style={{ color: '#d84558', background: '#fdebee', padding: '9px 12px', borderRadius: '8px', marginBottom: '14px', fontSize: '11px' }}>
            ⚠️ {error}
          </div>
        )}

        {step === 'request' ? (
          <form onSubmit={handleRequestCode}>
            <label>
              البريد الإلكتروني
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@hospital.com"
                autoFocus
              />
            </label>
            <button className="primary-button form-submit" type="submit" disabled={isLoading}>
              {isLoading ? 'جارٍ الإرسال...' : 'إرسال رمز التحقق'} <span>←</span>
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode}>
            <label>
              رمز التحقق
              <input
                type="text"
                required
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="••••••"
                autoFocus
              />
            </label>
            <button className="primary-button form-submit" type="submit" disabled={isLoading}>
              {isLoading ? 'جارٍ التحقق...' : 'تأكيد البريد'} <span>✓</span>
            </button>
            {devCode && (
              <small style={{ color: '#0b5cdf', background: '#eef5ff', padding: '6px 8px', borderRadius: '6px', display: 'block', textAlign: 'center', marginTop: '8px' }}>
                وضع التطوير — الرمز: <strong>{devCode}</strong>
              </small>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
