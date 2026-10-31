# 🧠 TeamBrain — Shared Persistent Memory for AI Coding Teams

> **TeamBrain** is an AI-powered collaborative engineering workspace and persistent memory layer that solves the "AI amnesia" problem for software teams. It extracts, embeds, manages, retrieves, and explains technical decisions, architecture choices, coding conventions, and project constraints across conversations and sessions.

---

## 🌟 Core Problem & Solution

### The Problem
AI coding assistants reset their context between sessions or conversations. They forget:
- Project architecture and tech stack choices
- Technical decisions and team conventions
- Constraints (e.g. *"Schema changes require approval"*)
- Past bugs, root causes, and solutions
- Team preferences and assigned responsibilities

### The Solution: TeamBrain
TeamBrain sits between your development team and AI models:
1. **Understands & Extracts**: Analyzes developer exchanges and automatically extracts durable project knowledge.
2. **Embeds & Stores**: Generates vector embeddings via **MongoDB Atlas AI (Voyage 3.5)** and **Google Gemini**, storing them in MongoDB Atlas with metadata isolation.
3. **Retrieves Semantically**: Leverages **MongoDB Atlas Vector Search** with cosine similarity and keyword boosting to fetch relevant context on-the-fly.
4. **Governs Decisions**: Detects contradictions before conflicting architecture proposals can overwrite approved team decisions.
5. **Explains Memory Usage**: Every AI response cites the exact memories and decisions that influenced its answer.

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Frontend (React 19 + Vite + Tailwind)                  │
│   • Dashboard        • AI Chat             • Memory Center                  │
│   • Projects         • Decision Tracker    • Tasks        • Settings        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ REST API (Bearer JWT)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Backend (FastAPI Modular Architecture)                │
│   • Auth & RBAC      • Memory Engine       • Decision Conflict Detector     │
│   • Workspace/Team   • Project Manager     • Task Kanban Engine             │
└───────────────────────┬──────────────────────────────────────┬──────────────┘
                        │                                      │
                        ▼                                      ▼
┌────────────────────────────────────────┐ ┌──────────────────────────────────┐
│      MongoDB Atlas Database            │ │        AI & Vector Engines       │
│  • Users & Workspace Members           │ │  • Google Gemini 3.1 Flash /     │
│  • Collections: memories, decisions,   │ │    Gemini 3.8 Flash (Generation) │
│    projects, tasks, conversations      │ │  • MongoDB Atlas AI (Voyage 3.5) │
│  • Atlas Vector Search ($vectorSearch) │ │    & Gemini-Embedding-001         │
│  • In-Memory Engine Fallback           │ │                                  │
└────────────────────────────────────────┘ └──────────────────────────────────┘
```

---

## 🚀 All 8 Completed Application Pages

1. **Authentication & Access (`/auth`)**:
   - Secure registration and login with bcrypt password hashing.
   - JWT access & refresh tokens with auto-refresh mechanism.
   - Auto-provisions a default workspace for new team members.

2. **Main Dashboard (`/`)**:
   - Real-time statistics: Total Memories, Active Tasks, Team Members, Approved Decisions.
   - Recent memory feed, pending decision approvals, and team activity audit logs.

3. **AI Chat with Persistent Memory (`/chat`)**:
   - Conversational assistant powered by Google Gemini.
   - Real-time semantic memory retrieval injecting relevant context.
   - Transparent memory citation panel showing which memories influenced each response.
   - Multi-conversation history with automatic title summarization.

4. **Memory Center (`/memories`)**:
   - Complete CRUD lifecycle: Create, Inspect, Edit, Correct, Archive, Delete.
   - Semantic vector search and category filtering (`architecture`, `decision`, `fact`, `constraint`, `bug_solution`, etc.).
   - Full version history tracking for every correction.

5. **Team Workspaces & Projects (`/projects`)**:
   - Multi-tenant workspace switching.
   - Project creation with tech stack tags, status tracking, and member management.
   - Team invitations with role-based permissions (`owner`, `admin`, `member`).

6. **Decision Tracker & Governance (`/decisions`)**:
   - Structured ADR (Architecture Decision Record) workflow: Proposed, Pending Approval, Approved, Rejected, Superseded.
   - **Conflict Detection Engine**: Detects when a new proposal contradicts an approved decision and flags it for team review.

7. **Task Kanban Management (`/tasks`)**:
   - Sprint task board (`To Do`, `In Progress`, `Review`, `Completed`).
   - Priority tagging, due dates, assignee management, and task comment threads.

8. **Settings & Diagnostic Hub (`/settings`)**:
   - Profile management, password changes, theme toggles, and memory preferences.
   - Real-time System Diagnostics checking MongoDB connectivity, Gemini text generation, and Vector Embedding health.

---

## 🛠️ Technology Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, React Router v7.
- **Backend**: Python 3.13 / FastAPI, Pydantic v2, Motor, PyMongo, python-jose, bcrypt, slowapi.
- **Database**: MongoDB Atlas with Atlas Vector Search index.
- **AI Models**:
  - Text Generation: `gemini-3.1-flash-lite`, `gemini-3.8-flash`
  - Vector Embeddings: MongoDB Atlas AI (`ai.mongodb.com/v1/embeddings`, `voyage-3.5`) and `gemini-embedding-001`.

---

## ⚙️ Environment Configuration

Configuration is located in `backend/.env`.

```env
# MongoDB Atlas Connection String
# Paste your cluster connection string here:
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
DATABASE_NAME=teambrain

# Google Gemini API
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.1-flash-lite
EMBEDDING_MODEL=voyage-3.5

# MongoDB Atlas AI Embedding API
MONGODB_ATLAS_AI_KEY=your_mongodb_atlas_ai_key_here
MONGODB_ATLAS_AI_ENDPOINT=https://ai.mongodb.com/v1/embeddings

# JWT Security
JWT_SECRET_KEY=auto_generated_secure_secret
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# CORS
FRONTEND_ORIGIN=http://localhost:5173
ENVIRONMENT=development
```

> **Note**: If `MONGODB_URI` is left blank, TeamBrain automatically starts with an in-memory MongoDB engine (`mongomock-motor`) so all 8 pages, authentication, chat, and CRUD operations can be tested immediately!

---

## 🔍 MongoDB Atlas Vector Search Index Setup

To enable native `$vectorSearch` in MongoDB Atlas:

1. Open your **MongoDB Atlas Console**.
2. Navigate to your cluster -> **Atlas Search & Vector Search** tab.
3. Click **Create Search Index** -> select **Atlas Vector Search (JSON Editor)**.
4. Select database `teambrain` and collection `memories`.
5. Enter index name: `memory_vector_index`.
6. Paste the following JSON definition:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1024,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "workspace_id"
    },
    {
      "type": "filter",
      "path": "status"
    }
  ]
}
```

*(If using Gemini embeddings instead of Voyage 3.5, set `numDimensions` to `3072`)*.

---

## 🏃 Running the Application

### 1. Start the Backend
From the project folder:
```powershell
cd backend
.\start.bat
```
Or directly:
```powershell
cd backend
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
- API will be live at: `http://localhost:8000`
- Interactive Swagger docs at: `http://localhost:8000/docs`

### 2. Start the Frontend
In a new terminal:
```powershell
.\start-frontend.bat
```
Or directly:
```powershell
cd BuildTeamBrainSaaSApp
npm run dev
```
- Web UI will be live at: `http://localhost:5173`

---

## 🧪 Running Automated Tests

Run the full test suites inside `backend`:

```powershell
cd backend
# Run core API test suite
.\venv\Scripts\pytest.exe tests/test_api.py -v

# Run 10-step hackathon acceptance workflow
.\venv\Scripts\pytest.exe tests/test_acceptance.py -s -v
```

---

## 🏆 Hackathon Demonstration Script (5-Minute Walkthrough)

1. **Sign Up**: Navigate to `http://localhost:5173/auth` and create an account. You will land directly on the Dashboard.
2. **Teach TeamBrain a Decision**:
   - Go to **AI Chat** (`/chat`).
   - Enter:
     > *"Our project uses React, FastAPI, and MongoDB Atlas. Database schema changes must receive team approval before implementation."*
   - TeamBrain confirms and records the decision.
3. **Verify Memory Extraction**:
   - Open **Memory Center** (`/memories`).
   - Observe the newly extracted memory tagged with category `decision` and high importance.
4. **Test AI Recall in a Fresh Session**:
   - Start a **New Conversation** in `/chat`.
   - Ask:
     > *"Can we migrate our database to PostgreSQL without approval?"*
   - Watch TeamBrain retrieve the stored decision, cite the exact memory in the right panel, and explain that team approval is required.
5. **Test Conflict Detection**:
   - Go to **Decisions** (`/decisions`).
   - Propose an opposing decision: *"Switch database to PostgreSQL without approval"*.
   - Watch the Conflict Detection system flag the contradiction with the approved policy.
6. **System Diagnostics**:
   - Visit **Settings** (`/settings`) -> **API Integrations**.
   - View live connectivity statuses for MongoDB, Gemini, and Atlas Voyage embeddings.
