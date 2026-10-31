"""TEAMBrain FastAPI application."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.database import connect_db, disconnect_db
from app.config import get_settings
from app.routers import auth, users, workspaces, projects, chat, memories, decisions, tasks, health

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    yield
    await disconnect_db()


app = FastAPI(
    title="TeamBrain API",
    description="Persistent AI memory engine for software teams",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(workspaces.router)
app.include_router(projects.router)
app.include_router(chat.router)
app.include_router(memories.router)
app.include_router(decisions.router)
app.include_router(tasks.router)


@app.get("/")
async def root():
    return {"message": "TeamBrain API is running", "docs": "/docs"}
