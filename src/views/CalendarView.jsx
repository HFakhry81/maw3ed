import React from 'react';

export default function CalendarView({ onViewChange, onOpenNewAppointment }) {
  const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const dates = [11, 12, 13, 14, 15, 16, 17];
  const hours = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'];

  return (
    <div className="panel" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '18px', color: 'var(--navy)' }}>التقويم الطبي التفاعلي</h2>
          <p style={{ color: '#8d99ad', fontSize: '11px', marginTop: '4px' }}>
            استعراض جداول الأطباء والمواعيد المتاحة على مدار الأسبوع
          </p>
        </div>
        <button className="primary-button" onClick={onOpenNewAppointment}>
          <span>＋</span> إضافة موعد
        </button>
      </div>

      <div style={{ border: '1px solid #edf1f7', borderRadius: '14px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)', background: '#f8fafc', borderBottom: '1px solid #edf1f7', textAlign: 'center', padding: '10px 0', fontSize: '11px', fontWeight: '700', color: 'var(--navy)' }}>
          <span>الوقت</span>
          {days.map((day, i) => (
            <span key={day} style={{ color: i === 3 ? '#1469eb' : 'inherit' }}>
              {day} <small style={{ display: 'block', color: '#8b9bb2', fontSize: '9px' }}>{dates[i]} مايو</small>
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {hours.map((hour, idx) => (
            <div key={hour} style={{ display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)', minHeight: '48px', borderBottom: '1px solid #f1f4f8', alignItems: 'center', fontSize: '10px', color: '#7a889e' }}>
              <span style={{ textAlign: 'center', fontWeight: '600' }}>{hour}</span>
              {days.map((d, dayIdx) => (
                <div key={d} style={{ borderRight: '1px solid #f1f4f8', height: '100%', padding: '4px', position: 'relative' }}>
                  {dayIdx === 3 && idx === 0 && (
                    <div style={{ background: '#eaf2ff', color: '#1056c8', borderRadius: '6px', padding: '4px 6px', fontSize: '9px', fontWeight: '700' }}>
                      كشف باطني • ليان
                    </div>
                  )}
                  {dayIdx === 3 && idx === 2 && (
                    <div style={{ background: '#fdf3d8', color: '#a07106', borderRadius: '6px', padding: '4px 6px', fontSize: '9px', fontWeight: '700' }}>
                      سونار • جود
                    </div>
                  )}
                  {dayIdx === 4 && idx === 1 && (
                    <div style={{ background: '#eafbf3', color: '#12865c', borderRadius: '6px', padding: '4px 6px', fontSize: '9px', fontWeight: '700' }}>
                      أطفال • مها
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
