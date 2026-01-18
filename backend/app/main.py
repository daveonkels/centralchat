from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import init_db
from .routers import search, conversations, imports

app = FastAPI(
    title="Central Chat Archive",
    description="Search across all your AI chat history",
    version="1.0.0",
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(search.router)
app.include_router(conversations.router)
app.include_router(imports.router)


@app.on_event("startup")
def startup():
    """Initialize database on startup."""
    init_db()


@app.get("/api/health")
def health_check():
    """Health check endpoint."""
    return {"status": "ok"}
