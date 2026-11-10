
from sqlalchemy import (
    Column, Integer, String, Date, DateTime,
    ForeignKey, Numeric, Text, UniqueConstraint
)
from sqlalchemy.sql import func
from .database import Base


class Income(Base):
    __tablename__ = "income_records"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, unique=True)
    cash_amount = Column(Numeric(12, 2), default=0)
    digital_amount = Column(Numeric(12, 2), default=0)
    created_at = Column(DateTime, server_default=func.now())


class ExpenseCategory(Base):
    __tablename__ = "expense_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)


class Expense(Base):
    __tablename__ = "expense_records"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("expense_categories.id"))
    description = Column(String(255), nullable=True)
    cash_amount = Column(Numeric(12, 2), default=0)
    digital_amount = Column(Numeric(12, 2), default=0)
    created_at = Column(DateTime, server_default=func.now())


class DailyBalance(Base):
    __tablename__ = "daily_balances"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, unique=True, nullable=False)

    opening_cash = Column(Numeric(12, 2), default=0)
    opening_digital = Column(Numeric(12, 2), default=0)

    income_cash = Column(Numeric(12, 2), default=0)
    income_digital = Column(Numeric(12, 2), default=0)

    expense_cash = Column(Numeric(12, 2), default=0)
    expense_digital = Column(Numeric(12, 2), default=0)

    closing_cash = Column(Numeric(12, 2), default=0)
    closing_digital = Column(Numeric(12, 2), default=0)


class Reconciliation(Base):
    __tablename__ = "reconciliations"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, unique=True)

    actual_cash = Column(Numeric(12, 2), nullable=False)
    actual_digital = Column(Numeric(12, 2), nullable=False)

    expected_cash = Column(Numeric(12, 2), nullable=False)
    expected_digital = Column(Numeric(12, 2), nullable=False)

    cash_difference = Column(Numeric(12, 2), nullable=False)
    digital_difference = Column(Numeric(12, 2), nullable=False)

    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
