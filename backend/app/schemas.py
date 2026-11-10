
from datetime import date
from decimal import Decimal
from pydantic import BaseModel, Field, model_validator


class IncomeCreate(BaseModel):
    date: date
    cash_amount: Decimal = Field(default=Decimal("0"), ge=0)
    digital_amount: Decimal = Field(default=Decimal("0"), ge=0)

    @model_validator(mode="after")
    def validate_income(self):
        if self.cash_amount + self.digital_amount <= 0:
            raise ValueError("Income must be greater than zero")
        return self


class ExpenseCreate(BaseModel):
    date: date
    category_id: int
    description: str = ""
    cash_amount: Decimal = Field(default=Decimal("0"), ge=0)
    digital_amount: Decimal = Field(default=Decimal("0"), ge=0)

    @model_validator(mode="after")
    def validate_expense(self):
        if self.cash_amount + self.digital_amount <= 0:
            raise ValueError("Expense must be greater than zero")
        return self


class ReconciliationCreate(BaseModel):
    date: date
    actual_cash: Decimal = Field(ge=0)
    actual_digital: Decimal = Field(ge=0)
    notes: str = ""
