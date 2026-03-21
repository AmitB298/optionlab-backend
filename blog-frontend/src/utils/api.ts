import axios from 'axios'

const api = axios.create({
  baseURL: '/api/blog',
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ol_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('ol_token')
      localStorage.removeItem('ol_user')
    }
    return Promise.reject(err)
  }
)

// ── AUTH ─────────────────────────────────────────────────────
export const authApi = {
  login:          (data: { email: string; password: string }) => api.post('/auth/login', data),
  me:             ()                                          => api.get('/auth/me'),
  changePassword: (data: { current_password: string; new_password: string }) => api.post('/auth/change-password', data),
}

// ── ARTICLES ─────────────────────────────────────────────────
export const articlesApi = {
  list:      (params?: Record<string, string | number>) => api.get('/articles', { params }),
  featured:  ()                                         => api.get('/articles/featured'),
  trending:  ()                                         => api.get('/articles/trending'),
  bySlug:    (slug: string)                             => api.get(`/articles/${slug}`),
  like:      (slug: string)                             => api.post(`/articles/${slug}/like`),
  adminAll:  (params?: Record<string, string | number>) => api.get('/articles/admin/all', { params }),
  create:    (data: Record<string, unknown>)            => api.post('/articles', data),
  update:    (id: number, data: Record<string, unknown>)=> api.put(`/articles/${id}`, data),
  delete:    (id: number)                               => api.delete(`/articles/${id}`),
}

// ── COMMENTS ────────────────────────────────────────────────
export const commentsApi = {
  list:   (articleId: number)                                                              => api.get(`/comments/${articleId}`),
  create: (articleId: number, data: { author_name: string; author_email?: string; body: string }) => api.post(`/comments/${articleId}`, data),
  like:   (id: number)                                                                     => api.post(`/comments/${id}/like`),
  delete: (id: number)                                                                     => api.delete(`/comments/${id}`),
}

// ── CATEGORIES / TAGS ────────────────────────────────────────
export const categoriesApi = {
  list:   () => api.get('/categories'),
  create: (data: Record<string, unknown>) => api.post('/categories', data),
}
export const tagsApi = {
  list: () => api.get('/tags'),
}

// ── AUTHORS ──────────────────────────────────────────────────
export const authorsApi = {
  list:       ()               => api.get('/authors'),
  byId:       (id: number)     => api.get(`/authors/${id}`),
  updateMe:   (data: Record<string, unknown>) => api.put('/authors/me', data),
}

// ── SUBSCRIBERS ──────────────────────────────────────────────
export const subscribersApi = {
  subscribe: (data: { email: string; name?: string; source?: string }) => api.post('/subscribers/subscribe', data),
  list:      ()                                                         => api.get('/subscribers/list'),
  count:     ()                                                         => api.get('/subscribers/count'),
}

// ── ANALYTICS ────────────────────────────────────────────────
export const analyticsApi = {
  dashboard: () => api.get('/analytics/dashboard'),
}

// ── AI ───────────────────────────────────────────────────────
export const aiApi = {
  chat:           (data: { messages?: {role:string;content:string}[]; question?: string }) => api.post('/ai/chat', data),
  briefing:       ()                                                                        => api.post('/ai/briefing'),
  getBriefing:    ()                                                                        => api.get('/ai/briefing/today'),
  assistWrite:    (data: { title: string; category?: string; outline_points?: string })    => api.post('/ai/assist-write', data),
  scoreSentiment: (data: { title: string; excerpt?: string; body?: string })               => api.post('/ai/score-sentiment', data),
}

export default api


