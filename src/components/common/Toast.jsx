import React from 'react';

export default function Toast({ toast }) {
  if (!toast || !toast.show) return null;

  return (
    <div className={`toast ${toast.show ? 'show' : ''}`} role="status">
      <span>✓</span>
      <div>
        <b>{toast.title || 'تمت العملية بنجاح'}</b>
        <small>{toast.message}</small>
      </div>
    </div>
  );
}
