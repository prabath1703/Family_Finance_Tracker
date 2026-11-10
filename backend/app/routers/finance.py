from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import (
    Income, Expense, ExpenseCategory,
    DailyBalance, Reconciliation
)
from app.schemas import (
    IncomeCreate, ExpenseCreate, ReconciliationCreate
)

router = APIRouter(prefix="/api/finance", tags=["Family Finance"])

ZERO = Decimal("0.00")


def recalculate_balances(db: Session, through_date=None):
    """Rebuild daily balances from the first transaction through the requested date."""
    income_dates = [r[0] for r in db.query(Income.date).all()]
    expense_dates = [r[0] for r in db.query(Expense.date).all()]
    transaction_dates = income_dates + expense_dates

    if through_date:
        transaction_dates.append(through_date)

    if not transaction_dates:
        return

    start_date = min(transaction_dates)
    end_date = max(transaction_dates)

    previous = (
        db.query(DailyBalance)
        .filter(DailyBalance.date < start_date)
        .order_by(DailyBalance.date.desc())
        .first()
    )

    opening_cash = previous.closing_cash if previous else ZERO
    opening_digital = previous.closing_digital if previous else ZERO

    db.query(DailyBalance).filter(
        DailyBalance.date >= start_date
    ).delete(synchronize_session=False)

    current = start_date
    while current <= end_date:
        income = db.query(Income).filter(Income.date == current).first()

        expense_totals = db.query(
            func.coalesce(func.sum(Expense.cash_amount), 0),
            func.coalesce(func.sum(Expense.digital_amount), 0)
        ).filter(Expense.date == current).first()

        income_cash = income.cash_amount if income else ZERO
        income_digital = income.digital_amount if income else ZERO
        expense_cash = Decimal(str(expense_totals[0] or 0))
        expense_digital = Decimal(str(expense_totals[1] or 0))

        closing_cash = opening_cash + income_cash - expense_cash
        closing_digital = opening_digital + income_digital - expense_digital

        db.add(DailyBalance(
            date=current,
            opening_cash=opening_cash,
            opening_digital=opening_digital,
            income_cash=income_cash,
            income_digital=income_digital,
            expense_cash=expense_cash,
            expense_digital=expense_digital,
            closing_cash=closing_cash,
            closing_digital=closing_digital
        ))

        opening_cash = closing_cash
        opening_digital = closing_digital
        current += timedelta(days=1)

    db.flush()


def get_balance(db: Session, target_date: date):
    recalculate_balances(db, target_date)
    return db.query(DailyBalance).filter(
        DailyBalance.date == target_date
    ).first()


@router.get("/categories")
def get_categories(db: Session = Depends(get_db)):
    return db.query(ExpenseCategory).order_by(ExpenseCategory.name).all()


@router.post("/income")
def add_income(data: IncomeCreate, db: Session = Depends(get_db)):
    existing = db.query(Income).filter(Income.date == data.date).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail="Income already exists for this date. Update it instead."
        )

    db.add(Income(
        date=data.date,
        cash_amount=data.cash_amount,
        digital_amount=data.digital_amount
    ))

    try:
        recalculate_balances(db)
        db.commit()
    except Exception:
        db.rollback()
        raise

    return {
        "message": "Income recorded successfully",
        "date": data.date,
        "total_income": data.cash_amount + data.digital_amount,
        "cash": data.cash_amount,
        "digital": data.digital_amount
    }


@router.put("/income/{target_date}")
def update_income(target_date: date, data: IncomeCreate, db: Session = Depends(get_db)):
    """Replace the recorded cash/digital split for an existing date."""
    if data.date != target_date:
        raise HTTPException(400, "Income date must match the date in the URL")

    existing = db.query(Income).filter(Income.date == target_date).first()
    if not existing:
        raise HTTPException(404, "No income exists for this date. Record it first.")

    existing.cash_amount = data.cash_amount
    existing.digital_amount = data.digital_amount

    try:
        recalculate_balances(db, target_date)
        db.commit()
    except Exception:
        db.rollback()
        raise

    return {
        "message": "Income updated successfully",
        "date": target_date,
        "cash": existing.cash_amount,
        "digital": existing.digital_amount,
        "total_income": existing.cash_amount + existing.digital_amount
    }


@router.post("/income/additional")
def add_additional_income(data: IncomeCreate, db: Session = Depends(get_db)):
    """Add extra income to the existing daily income instead of creating a duplicate."""
    existing = db.query(Income).filter(Income.date == data.date).first()

    if existing:
        existing.cash_amount = (existing.cash_amount or ZERO) + data.cash_amount
        existing.digital_amount = (existing.digital_amount or ZERO) + data.digital_amount
        cash_total = existing.cash_amount
        digital_total = existing.digital_amount
    else:
        existing = Income(
            date=data.date,
            cash_amount=data.cash_amount,
            digital_amount=data.digital_amount
        )
        db.add(existing)
        cash_total = data.cash_amount
        digital_total = data.digital_amount

    try:
        recalculate_balances(db, data.date)
        db.commit()
    except Exception:
        db.rollback()
        raise

    return {
        "message": "Additional income added successfully",
        "date": data.date,
        "cash": cash_total,
        "digital": digital_total,
        "total_income": cash_total + digital_total
    }


@router.post("/expenses")
def add_expense(data: ExpenseCreate, db: Session = Depends(get_db)):
    category = db.query(ExpenseCategory).filter(
        ExpenseCategory.id == data.category_id
    ).first()
    if not category:
        raise HTTPException(404, "Expense category not found")

    db.add(Expense(
        date=data.date,
        category_id=data.category_id,
        description=data.description,
        cash_amount=data.cash_amount,
        digital_amount=data.digital_amount
    ))

    try:
        recalculate_balances(db)
        db.commit()
    except Exception:
        db.rollback()
        raise

    return {
        "message": "Expense recorded successfully",
        "date": data.date,
        "category": category.name,
        "total_expense": data.cash_amount + data.digital_amount
    }


@router.put("/expenses/{expense_id}")
def update_expense(expense_id: int, data: ExpenseCreate, db: Session = Depends(get_db)):
    """Update an existing expense, including its cash/digital split and date."""
    existing = db.query(Expense).filter(Expense.id == expense_id).first()
    if not existing:
        raise HTTPException(404, "Expense not found")

    category = db.query(ExpenseCategory).filter(
        ExpenseCategory.id == data.category_id
    ).first()
    if not category:
        raise HTTPException(404, "Expense category not found")

    old_date = existing.date
    existing.date = data.date
    existing.category_id = data.category_id
    existing.description = data.description
    existing.cash_amount = data.cash_amount
    existing.digital_amount = data.digital_amount

    try:
        recalculate_balances(db, min(old_date, data.date))
        db.commit()
    except Exception:
        db.rollback()
        raise

    return {
        "message": "Expense updated successfully",
        "id": existing.id,
        "date": existing.date,
        "category": category.name,
        "cash": existing.cash_amount,
        "digital": existing.digital_amount,
        "total_expense": existing.cash_amount + existing.digital_amount
    }


@router.get("/daily/{target_date}")
def daily_summary(target_date: date, db: Session = Depends(get_db)):
    balance = get_balance(db, target_date)
    db.commit()

    income = db.query(Income).filter(Income.date == target_date).first()
    expenses = db.query(Expense).filter(Expense.date == target_date).all()

    total_income = (
        income.cash_amount + income.digital_amount if income else ZERO
    )
    total_expenses = sum(
        (e.cash_amount + e.digital_amount for e in expenses), ZERO
    )

    return {
        "date": target_date,
        "opening_cash": balance.opening_cash,
        "opening_digital": balance.opening_digital,
        "income_cash": balance.income_cash,
        "income_digital": balance.income_digital,
        "total_income": total_income,
        "expense_cash": balance.expense_cash,
        "expense_digital": balance.expense_digital,
        "total_expenses": total_expenses,
        "daily_savings": total_income - total_expenses,
        "closing_cash": balance.closing_cash,
        "closing_digital": balance.closing_digital,
        "total_closing_balance": balance.closing_cash + balance.closing_digital,
        "expense_count": len(expenses)
    }


@router.get("/daily-details/{target_date}")
def daily_details(target_date: date, db: Session = Depends(get_db)):
    """Return the complete transaction ledger for one selected date."""
    balance = get_balance(db, target_date)

    income = db.query(Income).filter(Income.date == target_date).first()

    expense_rows = (
        db.query(Expense, ExpenseCategory.name)
        .outerjoin(ExpenseCategory, Expense.category_id == ExpenseCategory.id)
        .filter(Expense.date == target_date)
        .order_by(Expense.id.asc())
        .all()
    )

    expenses = []
    for expense, category_name in expense_rows:
        expenses.append({
            "id": expense.id,
            "category_id": expense.category_id,
            "category": category_name or "Uncategorized",
            "description": expense.description or "",
            "cash_amount": expense.cash_amount or ZERO,
            "digital_amount": expense.digital_amount or ZERO,
            "total_amount": (expense.cash_amount or ZERO) + (expense.digital_amount or ZERO)
        })

    total_income = (
        (income.cash_amount or ZERO) + (income.digital_amount or ZERO)
        if income else ZERO
    )
    total_expenses = sum((item["total_amount"] for item in expenses), ZERO)

    db.commit()

    return {
        "date": target_date,
        "income": {
            "cash": income.cash_amount if income else ZERO,
            "digital": income.digital_amount if income else ZERO,
            "total": total_income
        },
        "expenses": expenses,
        "total_expenses": total_expenses,
        "net_savings": total_income - total_expenses,
        "opening_cash": balance.opening_cash,
        "opening_digital": balance.opening_digital,
        "closing_cash": balance.closing_cash,
        "closing_digital": balance.closing_digital,
        "closing_balance": balance.closing_cash + balance.closing_digital
    }


@router.get("/monthly/{year}/{month}")
def monthly_summary(year: int, month: int, db: Session = Depends(get_db)):
    if month < 1 or month > 12:
        raise HTTPException(400, "Month must be between 1 and 12")

    month_start = date(year, month, 1)
    next_month = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    month_end = next_month - timedelta(days=1)
    today = date.today()

    if month_start > today:
        raise HTTPException(400, "Future month reports are not available")

    calculation_end = min(month_end, today)
    balance = get_balance(db, calculation_end)

    incomes = db.query(Income).filter(
        Income.date >= month_start, Income.date < next_month
    ).all()
    expenses = db.query(Expense).filter(
        Expense.date >= month_start, Expense.date < next_month
    ).all()

    total_income = sum((i.cash_amount + i.digital_amount for i in incomes), ZERO)
    total_expenses = sum((e.cash_amount + e.digital_amount for e in expenses), ZERO)

    opening = db.query(DailyBalance).filter(
        DailyBalance.date < month_start
    ).order_by(DailyBalance.date.desc()).first()

    opening_cash = opening.closing_cash if opening else ZERO
    opening_digital = opening.closing_digital if opening else ZERO

    db.commit()

    return {
        "month": month_start.strftime("%B %Y"),
        "total_income": total_income,
        "total_expenses": total_expenses,
        "monthly_savings": total_income - total_expenses,
        "opening_balance": opening_cash + opening_digital,
        "closing_cash": balance.closing_cash,
        "closing_digital": balance.closing_digital,
        "closing_balance": balance.closing_cash + balance.closing_digital,
        "transaction_days": len(set(
            [i.date for i in incomes] + [e.date for e in expenses]
        ))
    }


@router.post("/reconcile")
def reconcile_balance(data: ReconciliationCreate, db: Session = Depends(get_db)):
    balance = get_balance(db, data.date)
    expected_cash = balance.closing_cash
    expected_digital = balance.closing_digital

    existing = db.query(Reconciliation).filter(
        Reconciliation.date == data.date
    ).first()

    values = {
        "actual_cash": data.actual_cash,
        "actual_digital": data.actual_digital,
        "expected_cash": expected_cash,
        "expected_digital": expected_digital,
        "cash_difference": data.actual_cash - expected_cash,
        "digital_difference": data.actual_digital - expected_digital,
        "notes": data.notes
    }

    if existing:
        for key, value in values.items():
            setattr(existing, key, value)
    else:
        db.add(Reconciliation(date=data.date, **values))

    db.commit()

    cash_difference = data.actual_cash - expected_cash
    digital_difference = data.actual_digital - expected_digital

    return {
        "date": data.date,
        "status": "MATCHED" if cash_difference == 0 and digital_difference == 0 else "MISMATCH",
        "expected_cash": expected_cash,
        "actual_cash": data.actual_cash,
        "cash_difference": cash_difference,
        "expected_digital": expected_digital,
        "actual_digital": data.actual_digital,
        "digital_difference": digital_difference
    }
