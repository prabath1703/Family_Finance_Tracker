import { useEffect, useState } from 'react'
import {
  LayoutDashboard, Wallet, Receipt, ShieldCheck,
  ChartNoAxesCombined, Plus, IndianRupee,
  RefreshCw, TrendingUp, TrendingDown,
  Banknote, Smartphone, CheckCircle, AlertCircle,
  CalendarDays, FileDown, ClipboardList, Pencil, X
} from 'lucide-react'
import { jsPDF } from 'jspdf'

import {
  getCategories, addIncome, updateIncome, addAdditionalIncome, addExpense, updateExpense,
  getDailySummary, getDailyDetails, getMonthlySummary,
  reconcileBalance
} from './services/api'

import './index.css'

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const money = (value) =>
  Number(value || 0).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  })

const prettyDate = (value) => {
  if (!value) return ''
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  })
}

function Field({ label, value, onChange, type = 'number', placeholder = '0.00' }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        min={type === 'number' ? '0' : undefined}
        step={type === 'number' ? '0.01' : undefined}
        required={type === 'date'}
      />
    </label>
  )
}

function App() {
  const [page, setPage] = useState('Dashboard')
  const [date, setDate] = useState(today())
  const [autoToday, setAutoToday] = useState(true)
  const [month, setMonth] = useState(today().slice(0, 7))
  const [categories, setCategories] = useState([])
  const [daily, setDaily] = useState(null)
  const [dailyDetails, setDailyDetails] = useState(null)
  const [monthly, setMonthly] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [income, setIncome] = useState({
    date: today(), cash_amount: '', digital_amount: ''
  })
  const [incomeMode, setIncomeMode] = useState('new')
  const [incomeDayDetails, setIncomeDayDetails] = useState(null)
  const [expenseDayDetails, setExpenseDayDetails] = useState(null)
  const [editingExpenseId, setEditingExpenseId] = useState(null)
  const [expense, setExpense] = useState({
    date: today(), category_id: '',
    description: '', cash_amount: '', digital_amount: ''
  })
  const [actual, setActual] = useState({
    actual_cash: '', actual_digital: '', notes: ''
  })
  const [reconciliation, setReconciliation] = useState(null)

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      // Keep requests sequential because balance endpoints rebuild SQLite balance rows.
      const d = await getDailySummary(date)
      const details = await getDailyDetails(date)
      const m = await getMonthlySummary(
        Number(month.slice(0, 4)),
        Number(month.slice(5, 7))
      )
      const c = await getCategories()

      setDaily(d.data)
      setDailyDetails(details.data)
      setMonthly(m.data)
      setCategories(c.data)
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        'Unable to load financial data. Check backend connection.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [date, month])

  // Show the saved ledger beneath each entry form, for the date selected in that form.
  useEffect(() => {
    let cancelled = false
    const loadFormDayRecords = async () => {
      try {
        const incomeResult = await getDailyDetails(income.date)
        if (!cancelled) setIncomeDayDetails(incomeResult.data)
        const expenseResult = await getDailyDetails(expense.date)
        if (!cancelled) setExpenseDayDetails(expenseResult.data)
      } catch (err) {
        if (!cancelled) {
          setIncomeDayDetails(null)
          setExpenseDayDetails(null)
        }
      }
    }
    loadFormDayRecords()
    return () => { cancelled = true }
  }, [income.date, expense.date])

  // If the app stays open overnight, select the new date automatically.
  useEffect(() => {
    const timer = setInterval(() => {
      const currentDate = today()
      if (autoToday) {
        setDate(currentDate)
        setIncome(previous => ({ ...previous, date: currentDate }))
        setExpense(previous => ({ ...previous, date: currentDate }))
      }
    }, 60000)
    return () => clearInterval(timer)
  }, [autoToday])

  const notify = (text) => {
    setMessage(text)
    setError('')
    setTimeout(() => setMessage(''), 3500)
  }

  const handleIncome = async (e) => {
    e.preventDefault()
    const payload = {
      date: income.date,
      cash_amount: Number(income.cash_amount || 0),
      digital_amount: Number(income.digital_amount || 0)
    }

    try {
      if (incomeMode === 'update') {
        await updateIncome(income.date, payload)
        notify('Existing income corrected successfully!')
      } else if (incomeMode === 'extra') {
        await addAdditionalIncome(payload)
        notify('Extra income added to this date!')
      } else {
        await addIncome(payload)
        notify('Income recorded successfully!')
      }

      const savedDate = income.date
      setIncome({ date: savedDate, cash_amount: '', digital_amount: '' })
      setIncomeMode('new')
      setDate(savedDate)
      setMonth(savedDate.slice(0, 7))
      await loadData()
      const refreshed = await getDailyDetails(savedDate)
      setIncomeDayDetails(refreshed.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to save income')
    }
  }

  const loadIncomeForCorrection = () => {
    const saved = incomeDayDetails?.income
    if (!saved || Number(saved.total) <= 0) {
      setError('There is no saved income for this date to correct.')
      return
    }
    setIncome({
      date: income.date,
      cash_amount: String(saved.cash ?? 0),
      digital_amount: String(saved.digital ?? 0)
    })
    setIncomeMode('update')
    setError('')
    notify('Current income loaded. Change the amounts and save.')
  }

  const prepareExtraIncome = () => {
    setIncome({
      date: income.date,
      cash_amount: '',
      digital_amount: ''
    })
    setIncomeMode('extra')
    setError('')
  }


  const handleExpense = async (e) => {
    e.preventDefault()
    const payload = {
      ...expense,
      category_id: Number(expense.category_id),
      cash_amount: Number(expense.cash_amount || 0),
      digital_amount: Number(expense.digital_amount || 0)
    }

    try {
      const savedDate = expense.date
      if (editingExpenseId !== null) {
        await updateExpense(editingExpenseId, payload)
        notify('Expense corrected successfully!')
      } else {
        await addExpense(payload)
        notify('Expense recorded successfully!')
      }

      setExpense({
        date: savedDate, category_id: '',
        description: '', cash_amount: '', digital_amount: ''
      })
      setEditingExpenseId(null)
      setDate(savedDate)
      setMonth(savedDate.slice(0, 7))
      await loadData()
      const refreshed = await getDailyDetails(savedDate)
      setExpenseDayDetails(refreshed.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to save expense')
    }
  }

  const startExpenseEdit = (item) => {
    setExpense({
      date: expenseDayDetails?.date || expense.date,
      category_id: String(item.category_id ?? ''),
      description: item.description || '',
      cash_amount: String(item.cash_amount ?? 0),
      digital_amount: String(item.digital_amount ?? 0)
    })
    setEditingExpenseId(item.id)
    setError('')
    notify('Expense loaded. Correct the details and save the changes.')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const cancelExpenseEdit = () => {
    setEditingExpenseId(null)
    setExpense({
      date: expenseDayDetails?.date || expense.date,
      category_id: '', description: '', cash_amount: '', digital_amount: ''
    })
    setError('')
  }

  const handleReconciliation = async (e) => {
    e.preventDefault()
    try {
      const result = await reconcileBalance({
        date,
        actual_cash: Number(actual.actual_cash),
        actual_digital: Number(actual.actual_digital),
        notes: actual.notes
      })
      setReconciliation(result.data)
      notify('Balance verification completed!')
    } catch (err) {
      setError(err.response?.data?.detail || 'Verification failed')
    }
  }

  const downloadDailyPdf = () => {
    if (!dailyDetails) return

    const pdf = new jsPDF()
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const left = 14
    const usableWidth = pageWidth - 28
    let y = 18

    const addLine = (text, options = {}) => {
      const fontSize = options.fontSize || 10
      const bold = options.bold || false
      pdf.setFont('helvetica', bold ? 'bold' : 'normal')
      pdf.setFontSize(fontSize)
      const wrapped = pdf.splitTextToSize(String(text), usableWidth)
      const lineHeight = fontSize * 0.48 + 2
      if (y + wrapped.length * lineHeight > pageHeight - 15) {
        pdf.addPage()
        y = 18
      }
      pdf.text(wrapped, left, y)
      y += wrapped.length * lineHeight + (options.gap ?? 1)
    }

    addLine('FAMILY FINANCE TRACKER', { fontSize: 17, bold: true, gap: 3 })
    addLine(`Daily Financial Statement — ${prettyDate(date)}`, { fontSize: 11, bold: true, gap: 5 })
    addLine('INCOME', { fontSize: 12, bold: true, gap: 2 })
    addLine(`Cash received: ${money(dailyDetails.income.cash)}`)
    addLine(`Digital received: ${money(dailyDetails.income.digital)}`)
    addLine(`Total income: ${money(dailyDetails.income.total)}`, { bold: true, gap: 5 })

    addLine('EXPENSE DETAILS', { fontSize: 12, bold: true, gap: 2 })
    if (!dailyDetails.expenses.length) {
      addLine('No expenses recorded for this date.')
    } else {
      dailyDetails.expenses.forEach((item, index) => {
        addLine(`${index + 1}. ${item.category} — ${money(item.total_amount)}`, { bold: true, gap: 0 })
        addLine(`Description: ${item.description || 'No description provided'}`, { gap: 0 })
        addLine(`Cash: ${money(item.cash_amount)} | Digital: ${money(item.digital_amount)}`, { gap: 3 })
      })
    }

    addLine('DAILY SUMMARY', { fontSize: 12, bold: true, gap: 2 })
    addLine(`Total expenses: ${money(dailyDetails.total_expenses)}`)
    addLine(`Net savings today (income minus expenses): ${money(dailyDetails.net_savings)}`, { bold: true })
    addLine(`Opening cash: ${money(dailyDetails.opening_cash)}`)
    addLine(`Opening digital: ${money(dailyDetails.opening_digital)}`)
    addLine(`Closing cash: ${money(dailyDetails.closing_cash)}`)
    addLine(`Closing digital: ${money(dailyDetails.closing_digital)}`)
    addLine(`Total closing balance: ${money(dailyDetails.closing_balance)}`, { bold: true, gap: 5 })
    addLine('Generated by Family Finance Tracker', { fontSize: 8 })

    pdf.save(`Family-Finance-${date}.pdf`)
  }

  const navItems = [
    { name: 'Dashboard', icon: LayoutDashboard },
    { name: 'Daily Records', icon: CalendarDays },
    { name: 'Income', icon: Wallet },
    { name: 'Expenses', icon: Receipt },
    { name: 'Verification', icon: ShieldCheck },
    { name: 'Reports', icon: ChartNoAxesCombined }
  ]

  const Card = ({ title, value, icon: Icon, color, sub }) => (
    <div className="stat-card">
      <div className="stat-top">
        <span>{title}</span>
        <div className={`stat-icon ${color}`}><Icon size={20} /></div>
      </div>
      <h2>{money(value)}</h2>
      <p>{sub}</p>
    </div>
  )

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon"><IndianRupee /></div>
          <div>
            <h2>Family Finance</h2>
            <span>Household Manager</span>
          </div>
        </div>

        <p className="nav-label">MAIN MENU</p>
        {navItems.map(item => (
          <button
            key={item.name}
            className={`nav-item ${page === item.name ? 'active' : ''}`}
            onClick={() => setPage(item.name)}
          >
            <item.icon size={19} />
            {item.name}
          </button>
        ))}

        <div className="sidebar-bottom">
          <div className="privacy-box">
            <ShieldCheck size={20} />
            <strong>Family Finance</strong>
            <p>Track every rupee. Build better savings.</p>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <h1>{page}</h1>
            <p>Welcome to your household financial overview.</p>
          </div>
          <div className="top-actions">
            <input type="date" value={date} onChange={e => { setDate(e.target.value); setAutoToday(e.target.value === today()) }} />
            <button className="refresh-btn" onClick={loadData}><RefreshCw size={17} /></button>
          </div>
        </header>

        {(message || error) && (
          <div className={`alert ${error ? 'error' : 'success'}`}>
            {error ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
            {error || message}
          </div>
        )}
        {loading && <p className="loading">Loading financial records...</p>}

        {!loading && page === 'Dashboard' && (
          <>
            <div className="welcome-card">
              <div>
                <span>FAMILY FINANCIAL OVERVIEW</span>
                <h2>Your money, clearly managed.</h2>
                <p>Understand your income, expenses and savings.</p>
              </div>
              <div className="welcome-icon"><Wallet size={46} /></div>
            </div>

            <div className="section-heading">
              <h2>Monthly Overview</h2>
              <input type="month" value={month} onChange={e => setMonth(e.target.value)} />
            </div>

            <div className="stats-grid">
              <Card title="Monthly Income" value={monthly?.total_income} icon={TrendingUp} color="green" sub="Total earnings" />
              <Card title="Total Expenses" value={monthly?.total_expenses} icon={TrendingDown} color="red" sub="Household spending" />
              <Card title="Monthly Savings" value={monthly?.monthly_savings} icon={IndianRupee} color="blue" sub="Income minus expenses" />
              <Card title="Closing Balance" value={monthly?.closing_balance} icon={Wallet} color="purple" sub="Cash + digital" />
            </div>

            <div className="section-heading">
              <h2>Available Balance</h2>
              <span>Selected date: {date}</span>
            </div>
            <div className="stats-grid two">
              <Card title="Cash in Hand" value={daily?.closing_cash} icon={Banknote} color="green" sub="Physical cash available" />
              <Card title="Digital Balance" value={daily?.closing_digital} icon={Smartphone} color="blue" sub="Bank / UPI balance" />
            </div>

            <div className="content-card">
              <h3>Daily Financial Summary</h3>
              <div className="summary-row"><span>Opening balance</span><strong>{money(Number(daily?.opening_cash || 0) + Number(daily?.opening_digital || 0))}</strong></div>
              <div className="summary-row"><span>Today's income</span><strong className="green-text">+ {money(daily?.total_income)}</strong></div>
              <div className="summary-row"><span>Today's expenses</span><strong className="red-text">- {money(daily?.total_expenses)}</strong></div>
              <div className="summary-row total-row"><span>Today's net savings</span><strong>{money(daily?.daily_savings)}</strong></div>
            </div>

            <div className="quick-actions">
              <button onClick={() => setPage('Income')}><Plus size={17} /> Add Income</button>
              <button onClick={() => setPage('Expenses')}><Plus size={17} /> Add Expense</button>
              <button onClick={() => setPage('Daily Records')}><ClipboardList size={17} /> View Daily Details</button>
              <button onClick={() => setPage('Verification')}><ShieldCheck size={17} /> Verify Balance</button>
            </div>
          </>
        )}

        {!loading && page === 'Daily Records' && (
          <>
            <div className="content-card form-card">
              <div className="section-heading">
                <div>
                  <h2><CalendarDays /> Daily Transaction Record</h2>
                  <p>{prettyDate(date)}</p>
                </div>
                <button className="primary-btn" type="button" onClick={downloadDailyPdf}>
                  <FileDown size={17} /> Download Daily PDF
                </button>
              </div>
              <label className="field">
                <span>Choose a date to view its complete financial record</span>
                <input type="date" value={date} onChange={e => { setDate(e.target.value); setAutoToday(e.target.value === today()) }} />
              </label>
            </div>

            <div className="stats-grid">
              <Card title="Total Income" value={dailyDetails?.income?.total} icon={TrendingUp} color="green" sub="Cash + digital" />
              <Card title="Total Expenses" value={dailyDetails?.total_expenses} icon={TrendingDown} color="red" sub="All recorded expenses" />
              <Card title="Net Savings" value={dailyDetails?.net_savings} icon={IndianRupee} color="blue" sub="Income minus expenses" />
              <Card title="Closing Balance" value={dailyDetails?.closing_balance} icon={Wallet} color="purple" sub="Cash + digital carried forward" />
            </div>

            <div className="content-card">
              <h3>Income Details</h3>
              <div className="summary-row"><span>Cash received</span><strong>{money(dailyDetails?.income?.cash)}</strong></div>
              <div className="summary-row"><span>Digital received</span><strong>{money(dailyDetails?.income?.digital)}</strong></div>
              <div className="summary-row total-row"><span>Total income</span><strong>{money(dailyDetails?.income?.total)}</strong></div>
            </div>

            <div className="content-card">
              <h3>Expense Details ({dailyDetails?.expenses?.length || 0})</h3>
              {dailyDetails?.expenses?.length ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="transaction-table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Description / Reason</th>
                        <th>Cash</th>
                        <th>Digital</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyDetails.expenses.map(item => (
                        <tr key={item.id}>
                          <td>{item.category}</td>
                          <td>{item.description || '—'}</td>
                          <td>{money(item.cash_amount)}</td>
                          <td>{money(item.digital_amount)}</td>
                          <td><strong>{money(item.total_amount)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan="4"><strong>Total expenses</strong></td>
                        <td><strong>{money(dailyDetails.total_expenses)}</strong></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <p>No expenses have been recorded for {prettyDate(date)}.</p>
              )}
            </div>

            <div className="content-card">
              <h3>End-of-Day Balance</h3>
              <div className="summary-row"><span>Opening cash</span><strong>{money(dailyDetails?.opening_cash)}</strong></div>
              <div className="summary-row"><span>Opening digital</span><strong>{money(dailyDetails?.opening_digital)}</strong></div>
              <div className="summary-row"><span>Closing cash</span><strong>{money(dailyDetails?.closing_cash)}</strong></div>
              <div className="summary-row"><span>Closing digital</span><strong>{money(dailyDetails?.closing_digital)}</strong></div>
              <div className="summary-row total-row"><span>Total closing balance</span><strong>{money(dailyDetails?.closing_balance)}</strong></div>
            </div>
          </>
        )}

        {!loading && page === 'Income' && (
          <>
            <div className="content-card form-card">
              <h2><Wallet /> Record Daily Income</h2>
              <p>Record income, correct an existing entry, or add extra income to the same date.</p>

              <label className="field">
                <span>Income Date</span>
                <input
                  type="date"
                  value={income.date}
                  onChange={e => {
                    const nextDate = e.target.value
                    setIncome({ date: nextDate, cash_amount: '', digital_amount: '' })
                    setIncomeMode('new')
                  }}
                />
              </label>

              <div className="quick-actions">
                <button type="button" onClick={loadIncomeForCorrection}>Edit / Correct Existing Income</button>
                <button type="button" onClick={prepareExtraIncome}><Plus size={17} /> Add Extra Income</button>
                <button type="button" onClick={() => { setIncome({ date: income.date, cash_amount: '', digital_amount: '' }); setIncomeMode('new') }}>New Daily Income</button>
              </div>

              <form onSubmit={handleIncome}>
                <div className="section-heading">
                  <h3>
                    {incomeMode === 'update' ? 'Correct Existing Income' :
                     incomeMode === 'extra' ? 'Add Extra Income' : 'New Daily Income'}
                  </h3>
                  <span>{prettyDate(income.date)}</span>
                </div>
                <div className="form-grid">
                  <Field label="Cash Received (₹)" value={income.cash_amount} onChange={e => setIncome({ ...income, cash_amount: e.target.value })} />
                  <Field label="Digital Received (₹)" value={income.digital_amount} onChange={e => setIncome({ ...income, digital_amount: e.target.value })} />
                </div>
                <div className="total-preview">
                  {incomeMode === 'extra' ? 'Extra amount to add: ' :
                   incomeMode === 'update' ? 'Corrected total income: ' : 'Total Income: '}
                  {money(Number(income.cash_amount || 0) + Number(income.digital_amount || 0))}
                </div>
                <button className="primary-btn" type="submit">
                  {incomeMode === 'update' ? 'Save Income Correction' :
                   incomeMode === 'extra' ? 'Add Extra Income' : 'Save Income'}
                </button>
              </form>
            </div>

            <div className="content-card">
              <h3>Saved Income for {prettyDate(income.date)}</h3>
              <div className="summary-row"><span>Cash received</span><strong>{money(incomeDayDetails?.income?.cash)}</strong></div>
              <div className="summary-row"><span>Digital received</span><strong>{money(incomeDayDetails?.income?.digital)}</strong></div>
              <div className="summary-row total-row"><span>Total income</span><strong>{money(incomeDayDetails?.income?.total)}</strong></div>
              <p className="muted">Use “Edit / Correct Existing Income” to replace the saved split, or “Add Extra Income” to increase it.</p>
            </div>

            <div className="content-card">
              <h3>Expenses Already Entered for {prettyDate(income.date)}</h3>
              {incomeDayDetails?.expenses?.length ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="transaction-table">
                    <thead><tr><th>Category</th><th>Description</th><th>Cash</th><th>Digital</th><th>Total</th></tr></thead>
                    <tbody>{incomeDayDetails.expenses.map(item => (
                      <tr key={item.id}>
                        <td>{item.category}</td><td>{item.description || '—'}</td>
                        <td>{money(item.cash_amount)}</td><td>{money(item.digital_amount)}</td><td><strong>{money(item.total_amount)}</strong></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <p>No expenses recorded for this date yet.</p>}
              <div className="summary-row total-row"><span>Total expenses</span><strong>{money(incomeDayDetails?.total_expenses)}</strong></div>
            </div>
          </>
        )}

        {!loading && page === 'Expenses' && (
          <>
            <div className="content-card form-card">
              <h2><Receipt /> {editingExpenseId !== null ? 'Edit Household Expense' : 'Record Household Expense'}</h2>
              <p>{editingExpenseId !== null ? 'Correct the category, date, description, or payment split, then save your changes.' : 'Add expenses individually. Include a useful description so the family can understand each transaction later.'}</p>
              <form onSubmit={handleExpense}>
                <Field label="Expense Date" type="date" value={expense.date} onChange={e => setExpense({ ...expense, date: e.target.value })} />
                <label className="field">
                  <span>Expense Category</span>
                  <select value={expense.category_id} onChange={e => setExpense({ ...expense, category_id: e.target.value })} required>
                    <option value="">Select category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Description / Reason</span>
                  <input
                    value={expense.description}
                    onChange={e => setExpense({ ...expense, description: e.target.value })}
                    placeholder="Example: Bought 1kg tomato and 2kg onions"
                  />
                </label>
                <div className="form-grid">
                  <Field label="Cash Paid (₹)" value={expense.cash_amount} onChange={e => setExpense({ ...expense, cash_amount: e.target.value })} />
                  <Field label="Digital Paid (₹)" value={expense.digital_amount} onChange={e => setExpense({ ...expense, digital_amount: e.target.value })} />
                </div>
                <div className="total-preview">Total Expense: {money(Number(expense.cash_amount || 0) + Number(expense.digital_amount || 0))}</div>
                <div className="quick-actions">
                  <button className="primary-btn" type="submit">
                    {editingExpenseId !== null ? 'Save Expense Correction' : 'Save Expense'}
                  </button>
                  {editingExpenseId !== null && (
                    <button type="button" onClick={cancelExpenseEdit}><X size={16} /> Cancel Edit</button>
                  )}
                </div>
              </form>
            </div>

            <div className="content-card">
              <h3>Transactions Already Entered for {prettyDate(expense.date)}</h3>
              <div className="summary-row"><span>Total income</span><strong className="green-text">{money(expenseDayDetails?.income?.total)}</strong></div>
              {expenseDayDetails?.expenses?.length ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="transaction-table">
                    <thead><tr><th>Category</th><th>Description / Reason</th><th>Cash</th><th>Digital</th><th>Total</th><th>Action</th></tr></thead>
                    <tbody>{expenseDayDetails.expenses.map(item => (
                      <tr key={item.id}>
                        <td>{item.category}</td><td>{item.description || '—'}</td>
                        <td>{money(item.cash_amount)}</td><td>{money(item.digital_amount)}</td><td><strong>{money(item.total_amount)}</strong></td>
                        <td><button type="button" className="refresh-btn" onClick={() => startExpenseEdit(item)} title="Edit this expense"><Pencil size={16} /> Edit</button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <p>No expenses recorded for this date yet.</p>}
              <div className="summary-row total-row"><span>Total expenses</span><strong>{money(expenseDayDetails?.total_expenses)}</strong></div>
              <div className="summary-row"><span>Net savings for the day</span><strong>{money(expenseDayDetails?.net_savings)}</strong></div>
            </div>
          </>
        )}

        {!loading && page === 'Verification' && (
          <div className="content-card form-card">
            <h2><ShieldCheck /> End-of-Day Verification</h2>
            <p>Count your actual cash and check your bank / UPI balance.</p>
            <div className="verification-expected">
              <div><span>Expected Cash</span><h2>{money(daily?.closing_cash)}</h2></div>
              <div><span>Expected Digital</span><h2>{money(daily?.closing_digital)}</h2></div>
            </div>
            <form onSubmit={handleReconciliation}>
              <div className="form-grid">
                <Field label="Actual Cash in Hand (₹)" value={actual.actual_cash} onChange={e => setActual({ ...actual, actual_cash: e.target.value })} />
                <Field label="Actual Digital Balance (₹)" value={actual.actual_digital} onChange={e => setActual({ ...actual, actual_digital: e.target.value })} />
              </div>
              <label className="field">
                <span>Notes (optional)</span>
                <input value={actual.notes} onChange={e => setActual({ ...actual, notes: e.target.value })} placeholder="Explain any difference" />
              </label>
              <button className="primary-btn" type="submit">Verify My Balance</button>
            </form>
            {reconciliation && (
              <div className={`verification-result ${reconciliation.status === 'MATCHED' ? 'matched' : 'mismatch'}`}>
                <h3>{reconciliation.status === 'MATCHED' ? '✓ Balances Matched' : '⚠ Balance Difference Found'}</h3>
                <p>Cash difference: {money(reconciliation.cash_difference)}</p>
                <p>Digital difference: {money(reconciliation.digital_difference)}</p>
              </div>
            )}
          </div>
        )}

        {!loading && page === 'Reports' && (
          <>
            <div className="content-card form-card">
              <h2><ChartNoAxesCombined /> Monthly Financial Report</h2>
              <label className="field">
                <span>Select Month</span>
                <input type="month" value={month} onChange={e => setMonth(e.target.value)} />
              </label>
            </div>
            <div className="stats-grid">
              <Card title="Total Income" value={monthly?.total_income} icon={TrendingUp} color="green" sub="Selected month" />
              <Card title="Total Expenses" value={monthly?.total_expenses} icon={TrendingDown} color="red" sub="Selected month" />
              <Card title="Net Savings" value={monthly?.monthly_savings} icon={IndianRupee} color="blue" sub="Income minus expenses" />
              <Card title="Closing Balance" value={monthly?.closing_balance} icon={Wallet} color="purple" sub="Available money" />
            </div>
            <div className="content-card">
              <h3>Monthly Balance Details</h3>
              <div className="summary-row"><span>Opening balance</span><strong>{money(monthly?.opening_balance)}</strong></div>
              <div className="summary-row"><span>Cash at month end</span><strong>{money(monthly?.closing_cash)}</strong></div>
              <div className="summary-row"><span>Digital at month end</span><strong>{money(monthly?.closing_digital)}</strong></div>
              <div className="summary-row total-row"><span>Days with transactions</span><strong>{monthly?.transaction_days || 0}</strong></div>
            </div>
          </>
        )}

        <footer>Family Finance Tracker · Your family's money, managed transparently.</footer>
      </main>
    </div>
  )
}

export default App
