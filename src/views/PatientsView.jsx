import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';

export default function PatientsView() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getPatients()
      .then((res) => setPatients(res.patients || []))
      .catch((err) => console.error('Failed to load patients', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="panel" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '18px', color: 'var(--navy)' }}>سجلات وملفات المرضى</h2>
          <p style={{ color: '#8d99ad', fontSize: '11px', marginTop: '4px' }}>
            قاعدة بيانات المرضى المسجلين وتاريخ آخر زيارة
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#8b9bb2' }}>جارٍ تحميل السجلات...</div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>اسم المريض</th>
              <th>البريد الإلكتروني</th>
              <th>تاريخ الانضمام</th>
              <th>آخر زيارة</th>
            </tr>
          </thead>
          <tbody>
            {patients.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '30px', color: '#9ba5b8' }}>
                  لا توجد ملفات مرضى مسجلة بعد.
                </td>
              </tr>
            ) : (
              patients.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="avatar sky">{p.name.charAt(0)}</span>
                      <strong>{p.name}</strong>
                    </div>
                  </td>
                  <td>{p.email || '—'}</td>
                  <td>{p.joinedAt || '—'}</td>
                  <td>
                    <span className="pill active">{p.lastVisit || 'موعد أول'}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
