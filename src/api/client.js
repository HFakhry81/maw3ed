const API_BASE = '/api';

export async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export function trackEvent(event, details = {}) {
  fetch(`${API_BASE}/development-events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, details }),
    keepalive: true
  }).catch((err) => console.warn('Tracking event failed:', err));
}

export const api = {
  getDashboard: (date = '2025-05-14') => request(`/dashboard?date=${date}`),
  getAppointments: (date) => request(date ? `/appointments?date=${date}` : '/appointments'),
  createAppointment: (payload) => request('/appointments', { method: 'POST', body: JSON.stringify(payload) }),
  getDepartments: () => request('/departments'),
  getDoctors: () => request('/doctors'),
  getPatients: () => request('/patients'),
  
  // Auth & Email Verification
  requestVerification: (email, locale = 'ar') => request('/auth/request-verification', { method: 'POST', body: JSON.stringify({ email, locale }) }),
  verifyEmail: (email, code) => request('/auth/verify-email', { method: 'POST', body: JSON.stringify({ email, code }) }),
  getAccount: () => request('/account'),
  
  // Plans & Billing
  getPlans: () => request('/plans'),
  requestPlan: (planKey) => request('/billing/request', { method: 'POST', body: JSON.stringify({ planKey }) }),
  
  // Admin Endpoints
  getAdminOverview: () => request('/admin/overview'),
  getAdminWorkspaces: () => request('/admin/workspaces'),
  getAdminSubscriptions: () => request('/admin/subscriptions'),
  updateAdminSubscription: (id, status) => request(`/admin/subscriptions/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  getAdminPlans: () => request('/admin/plans'),
  updateAdminPlan: (planKey, priceUsd) => request(`/admin/plans/${planKey}`, { method: 'PATCH', body: JSON.stringify({ priceUsd }) }),
  getAdminAudit: () => request('/admin/audit')
};
