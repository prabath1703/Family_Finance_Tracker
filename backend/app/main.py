
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine, SessionLocal
from app import models
from app.routers import finance

app = FastAPI(
    title="Family Finance Tracker",
    description="Household income, expenses, savings and reconciliation",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(finance.router)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)

    categories = [
        "Monthly EMI",
        "TVS Auto Finance EMI",
        "Groceries",
        "Vegetables",
        "Transport",
        "Household Expenses",
        "Tea and Snacks",
        "Cigarettes",
        "Alcohol",
        "Outside Food",
        "Auto Repairs",
        "Daughter Expenses",
        "Son Expenses",
        "Medical Expenses",
        "Other"
    ]

    db = SessionLocal()
    try:
        for name in categories:
            exists = db.query(models.ExpenseCategory).filter(
                models.ExpenseCategory.name == name
            ).first()

            if not exists:
                db.add(models.ExpenseCategory(name=name))

        db.commit()
    finally:
        db.close()


@app.get("/")
def home():
    return {"message": "Family Finance Tracker API Running"}


@app.get("/health")
def health():
    return {"status": "healthy"}
