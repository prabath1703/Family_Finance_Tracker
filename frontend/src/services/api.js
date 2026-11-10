import axios from 'axios'

const api = axios.create({
  baseURL: 'http://127.0.0.1:8000/api/finance',
  headers: { 'Content-Type': 'application/json' }
})

export const getCategories = () => api.get('/categories')
export const addIncome = (data) => api.post('/income', data)
export const updateIncome = (date, data) => api.put(`/income/${date}`, data)
export const addAdditionalIncome = (data) => api.post('/income/additional', data)
export const addExpense = (data) => api.post('/expenses', data)
export const updateExpense = (id, data) => api.put(`/expenses/${id}`, data)
export const getDailySummary = (date) => api.get(`/daily/${date}`)
export const getDailyDetails = (date) => api.get(`/daily-details/${date}`)
export const getMonthlySummary = (year, month) => api.get(`/monthly/${year}/${month}`)
export const reconcileBalance = (data) => api.post('/reconcile', data)

export default api
