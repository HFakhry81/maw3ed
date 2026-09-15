import React, { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function ServicesView() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDepartments()
      .then((res) => setDepartments(res.departments || []))
      .catch((err) => console.error('Failed to load departments', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="panel" style={{ padding: '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', color: 'var(--navy)' }}>الأقسام والعيادات الطبية</h2>
        <p style={{ color: '#8d99ad', fontSize: '11px', marginTop: '4px' }}>
          تخصيص الأقسام والخدمات التلقائية لكل عيادة
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#8b9bb2' }}>جارٍ التحميل...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {departments.map((dept) => (
            <div
              key={dept.id}
              style={{
                border: '1px solid #e2eaf5',
                borderRadius: '14px',
                padding: '16px',
                background: '#fafcff'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <span style={{ background: '#eaf2ff', color: '#1769e8', width: '32px', height: '32px', borderRadius: '10px', display: 'grid', placeItems: 'center', fontWeight: 'bold' }}>
                  ✚
                </span>
                <strong style={{ fontSize: '14px', color: 'var(--navy)' }}>{dept.name}</strong>
              </div>
              <p style={{ color: '#687894', fontSize: '11px' }}>
                الخدمة الافتراضية: <strong>{dept.default_service}</strong>
              </p>
              <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                <span className="pill active">نشط</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
