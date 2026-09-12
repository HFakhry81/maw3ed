import React, { useState, useEffect } from 'react';
import { api, trackEvent } from '../../api/client';

export default function AppointmentModal({ isOpen, onClose, onSuccess, departments = [], doctors = [] }) {
  const [patientName, setPatientName] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState('2025-05-14');
  const [time, setTime] = useState('09:00');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (departments.length > 0 && !departmentId) {
      setDepartmentId(departments[0].id);
    }
  }, [departments, departmentId]);

  useEffect(() => {
    if (doctors.length > 0 && !doctorId) {
      setDoctorId(doctors[0].id);
    }
  }, [doctors, doctorId]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const result = await api.createAppointment({
        patientName: patientName.trim(),
        departmentId,
        doctorId,
        date,
        time
      });

      trackEvent('appointment_created', {
        appointmentId: result.appointment?.id,
        source: 'react_modal'
      });

      setPatientName('');
      onSuccess(result.appointment);
      onClose();
    } catch (err) {
      setError(err.message || 'تعذر حجز الموعد');
      trackEvent('appointment_create_failed', { reason: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="modal-close" onClick={onClose} aria-label="إغلاق">×</button>
        <div className="modal-kicker">حجز طبي جديد</div>
        <h2>أضف موعداً للمريض</h2>
        <p>أدخل تفاصيل المريض والعيادة وسيظهر الموعد مباشرة في الجدول الطبي.</p>

        {error && (
          <div style={{ color: '#d84558', background: '#fdebee', padding: '9px 12px', borderRadius: '8px', marginBottom: '14px', fontSize: '11px' }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label>
            اسم المريض
            <input
              type="text"
              required
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="مثال: أحمد محمد"
              autoFocus
            />
          </label>

          <div className="form-row">
            <label>
              القسم أو العيادة
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                required
              >
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              التاريخ
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              الوقت
              <input
                type="time"
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </label>

            <label>
              الطبيب
              <select
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                required
              >
                {doctors.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button className="primary-button form-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'جارٍ الحفظ...' : 'تأكيد الموعد'} <span>←</span>
          </button>
        </form>
      </div>
    </div>
  );
}
