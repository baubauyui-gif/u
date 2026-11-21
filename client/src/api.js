const jsonHeaders = { 'Content-Type': 'application/json' };

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body ? jsonHeaders : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('No pudimos conectarnos con CHANGAPP. Revisá tu conexión e intentá nuevamente.', 0);
  }

  if (response.status === 204) return null;
  let payload = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    payload = await response.json().catch(() => null);
  }
  if (!response.ok) {
    throw new ApiError(payload?.error || 'Algo salió mal. Intentá nuevamente.', response.status, payload?.details);
  }
  return payload;
}

function query(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const str = search.toString();
  return str ? `?${str}` : '';
}

export const api = {
  config: () => request('/config'),
  provinces: () => request('/geo/provinces'),
  localities: (params) => request(`/geo/localities${query(params)}`),
  reverseGeocode: (lat, lng) => request(`/geo/reverse?lat=${lat}&lng=${lng}`),

  register: (body) => request('/auth/register', { method: 'POST', body }),
  login: (body) => request('/auth/login', { method: 'POST', body }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  forgotPassword: (body) => request('/auth/forgot-password', { method: 'POST', body }),
  resetPassword: (body) => request('/auth/reset-password', { method: 'POST', body }),
  changePassword: (body) => request('/auth/change-password', { method: 'POST', body }),

  jobs: (params) => request(`/jobs${query(params)}`),
  job: (id) => request(`/jobs/${id}`),
  createJob: (body) => request('/jobs', { method: 'POST', body }),
  updateJob: (id, body) => request(`/jobs/${id}`, { method: 'PATCH', body }),
  deleteJob: (id) => request(`/jobs/${id}`, { method: 'DELETE' }),
  jobAction: (id, action, body) => request(`/jobs/${id}/${action}`, { method: 'POST', body }),
  apply: (id, body) => request(`/jobs/${id}/applications`, { method: 'POST', body }),
  applicationsForJob: (id) => request(`/jobs/${id}/applications`),
  application: (id) => request(`/applications/${id}`),
  applicationAction: (id, action) => request(`/applications/${id}/${action}`, { method: 'POST' }),
  openConversation: (jobId) => request(`/jobs/${jobId}/conversation`, { method: 'POST' }),

  conversations: () => request('/conversations'),
  conversation: (id) => request(`/conversations/${id}`),
  sendMessage: (id, body) => request(`/conversations/${id}/messages`, { method: 'POST', body: { body } }),

  notifications: () => request('/notifications'),
  readNotification: (id) => request(`/notifications/${id}/read`, { method: 'POST' }),
  readAllNotifications: () => request('/notifications/read-all', { method: 'POST' }),

  review: (body) => request('/reviews', { method: 'POST', body }),
  userReviews: (id) => request(`/users/${id}/reviews`),
  report: (body) => request('/reports', { method: 'POST', body }),
  reportReasons: () => request('/reports/reasons'),
  blocks: () => request('/blocks'),
  block: (userId) => request(`/blocks/${userId}`, { method: 'POST' }),
  unblock: (userId) => request(`/blocks/${userId}`, { method: 'DELETE' }),

  profile: () => request('/me'),
  updateProfile: (body) => request('/me', { method: 'PATCH', body }),
  updateLocation: (body) => request('/me/location', { method: 'PATCH', body }),
  myJobs: () => request('/me/jobs'),
  myWorks: () => request('/me/works'),
  myApplications: () => request('/me/applications'),
  myProposals: () => request('/me/proposals'),
  user: (id) => request(`/users/${id}`),

  adminStats: () => request('/admin/stats'),
  adminUsers: (params) => request(`/admin/users${query(params)}`),
  adminUserAction: (id, action, body) => request(`/admin/users/${id}/${action}`, { method: 'POST', body }),
  adminJobs: (params) => request(`/admin/jobs${query(params)}`),
  adminJobAction: (id, action, body) => request(`/admin/jobs/${id}/${action}`, { method: 'POST', body }),
  adminReports: (params) => request(`/admin/reports${query(params)}`),
  adminResolveReport: (id, body) => request(`/admin/reports/${id}/resolve`, { method: 'POST', body }),
  adminCategories: () => request('/admin/categories'),
  adminCreateCategory: (body) => request('/admin/categories', { method: 'POST', body }),
  adminUpdateCategory: (id, body) => request(`/admin/categories/${id}`, { method: 'PATCH', body }),
  adminSettings: () => request('/admin/settings'),
  adminUpdateSettings: (body) => request('/admin/settings', { method: 'PATCH', body }),
  adminActivity: () => request('/admin/activity'),
};

export function errorMessage(error) {
  if (error instanceof ApiError) return error.message;
  return 'Algo salió mal. Intentá nuevamente.';
}
