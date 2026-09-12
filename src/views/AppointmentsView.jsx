import React, { useState } from 'react';

export default function AppointmentsView({ appointments = [], onOpenNewAppointment }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = appointments.filter((appt) => {
    if (filter !== 'all' && appt.status !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        appt.patientName?.toLowerCase().includes(q) ||
        appt.doctorName?.toLowerCase().includes(q) ||
        appt.departmentName?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="panel" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '18px', color: 'var(--navy)' }}>سجل المواعيد الطبية</h2>
          <p style={{ color: '#8d99ad', fontSize: '11px', marginTop: '4px' }}>
            عرض ومتابعة كافة الحجوزات مع إمكانية التصفية والبحث الفوري
          </p>
        </div>
        <button className="primary-button" onClick={onOpenNewAppointment}>
          <span>＋</span> موعد جديد
        </button>
      </div>

      {/* Filters and search */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="ابحث باسم المريض أو الطبيب..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            border: '1px solid #e0e9f7',
            borderRadius: '8px',
            padding: '8px 14px',
            fontSize: '11px',
            minWidth: '220px',
            direction: 'rtl'
          }}
        />
        <div style={{ display: 'flex', gap: '6px' }}>
          {[
            { id: 'all', label: 'الكل' },
            { id: 'confirmed', label: 'مؤكد' },
            { id: 'pending', label: 'قيد الانتظار' },
            { id: 'completed', label: 'مكتمل' },
            { id: 'cancelled', label: 'ملغى' }
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setFilter(item.id)}
              style={{
                border: '1px solid #dfe7f2',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '10px',
                background: filter === item.id ? '#1769e8' : '#fff',
                color: filter === item.id ? '#fff' : '#5b6a83',
                fontWeight: filter === item.id ? '700' : '500'
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <table className="admin-table">
        <thead>
          <tr>
            <th>المريض</th>
            <th>القسم / العيادة</th>
            <th>الطبيب المعالج</th>
            <th>التاريخ والوقت</th>
            <th>الحالة</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ textAlign: 'center', padding: '30px', color: '#9ba5b8' }}>
                لا توجد مواعيد مطابقة.
              </td>
            </tr>
          ) : (
            filtered.map((appt) => (
              <tr key={appt.id}>
                <td>
                  <strong>{appt.patientName}</strong>
                </td>
                <td>{appt.departmentName || appt.serviceName}</td>
                <td>{appt.doctorName}</td>
                <td style={{ direction: 'ltr', textAlign: 'right' }}>
                  {appt.date} • {appt.time}
                </td>
                <td>
                  <span className={`status ${appt.status || 'pending'}`}>
                    {appt.status === 'confirmed' ? 'مؤكد' : appt.status === 'completed' ? 'مكتمل' : 'قيد المراجعة'}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
