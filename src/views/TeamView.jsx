import React, { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function TeamView() {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDoctors()
      .then((res) => setDoctors(res.doctors || []))
      .catch((err) => console.error('Failed to load doctors', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="panel" style={{ padding: '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', color: 'var(--navy)' }}>الأطباء والطاقم الطبي</h2>
        <p style={{ color: '#8d99ad', fontSize: '11px', marginTop: '4px' }}>
          إدارة الكوادر الطبية والتخصصات وجداول المناوبات
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#8b9bb2' }}>جارٍ التحميل...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {doctors.map((doc) => (
            <div
              key={doc.id}
              style={{
                border: '1px solid #e2eaf5',
                borderRadius: '16px',
                padding: '20px',
                background: '#fff',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                boxShadow: '0 8px 24px rgba(20, 50, 100, 0.04)'
              }}
            >
              <div className="avatar coral" style={{ width: '42px', height: '42px', fontSize: '15px' }}>
                {doc.name.replace(/^د\.\s*/, '').charAt(0)}
              </div>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: '14px', color: 'var(--navy)', display: 'block' }}>{doc.name}</strong>
                <span style={{ color: '#8d99ad', fontSize: '11px' }}>{doc.specialty}</span>
              </div>
              <span className="pill active">متاح</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
