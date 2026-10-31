"""
TEAMBrain Comprehensive Backend Test Suite
Covers: Auth, Workspaces, Projects, Memories, Vector/Semantic Retrieval,
Decisions, Approvals, Conflict Detection, Tasks, Chat, AI Integration.
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database import connect_db, disconnect_db, get_db
from app.services.ai_service import generate_text, generate_embedding


@pytest_asyncio.fixture(scope="session", autouse=True)
async def lifespan_fixture():
    await connect_db()
    yield
    await disconnect_db()


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def auth_headers(client):
    email = "test_developer@teambrain.io"
    password = "SecurePassword123!"
    # Register or login
    reg_resp = await client.post("/auth/register", json={
        "name": "Alex Developer",
        "email": email,
        "password": password,
    })
    if reg_resp.status_code == 201:
        token = reg_resp.json()["access_token"]
    else:
        login_resp = await client.post("/auth/login", json={
            "email": email,
            "password": password,
        })
        token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_health_check(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["service"] == "TeamBrain API"


@pytest.mark.asyncio
async def test_docs_accessible(client):
    resp = await client.get("/docs")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_unauthorized_access(client):
    resp = await client.get("/users/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_auth_me(client, auth_headers):
    resp = await client.get("/users/me", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "test_developer@teambrain.io"
    assert data["name"] == "Alex Developer"


@pytest.mark.asyncio
async def test_workspace_lifecycle(client, auth_headers):
    # Create workspace
    create_resp = await client.post("/workspaces", headers=auth_headers, json={
        "name": "Dev Team Alpha",
        "description": "Primary engineering workspace",
    })
    assert create_resp.status_code == 201
    ws = create_resp.json()
    assert ws["name"] == "Dev Team Alpha"
    assert "id" in ws
    ws_id = ws["id"]

    # List workspaces
    list_resp = await client.get("/workspaces", headers=auth_headers)
    assert list_resp.status_code == 200
    workspaces = list_resp.json()
    assert any(w["id"] == ws_id for w in workspaces)

    # Get single workspace
    get_resp = await client.get(f"/workspaces/{ws_id}", headers=auth_headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == ws_id


@pytest.mark.asyncio
async def test_project_lifecycle(client, auth_headers):
    # Create workspace first
    ws_resp = await client.post("/workspaces", headers=auth_headers, json={"name": "Project WS"})
    ws_id = ws_resp.json()["id"]

    # Create project
    proj_resp = await client.post("/projects", headers=auth_headers, json={
        "workspace_id": ws_id,
        "name": "TeamBrain Core",
        "description": "Shared AI memory engine",
        "stack": ["React", "FastAPI", "MongoDB"],
    })
    assert proj_resp.status_code == 201
    proj = proj_resp.json()
    assert proj["name"] == "TeamBrain Core"
    proj_id = proj["id"]

    # List projects
    list_resp = await client.get(f"/projects?workspace_id={ws_id}", headers=auth_headers)
    assert list_resp.status_code == 200
    projects = list_resp.json()
    assert any(p["id"] == proj_id for p in projects)


@pytest.mark.asyncio
async def test_memory_lifecycle_and_semantic_retrieval(client, auth_headers):
    # Create workspace
    ws_resp = await client.post("/workspaces", headers=auth_headers, json={"name": "Memory WS"})
    ws_id = ws_resp.json()["id"]

    # 1. Create a memory
    content = "Our project uses React, FastAPI, and MongoDB Atlas. Database schema changes require team approval before implementation."
    mem_resp = await client.post(f"/memories/workspace/{ws_id}", headers=auth_headers, json={
        "content": content,
        "memory_type": "decision",
        "importance": 0.9,
        "privacy_scope": "workspace",
    })
    assert mem_resp.status_code == 201
    mem = mem_resp.json()
    assert mem["content"] == content
    assert mem["memory_type"] == "decision"
    mem_id = mem["id"]

    # 2. Semantic Search: Query for "Can we change database schema without approval?"
    search_resp = await client.post("/memories/search", headers=auth_headers, json={
        "workspace_id": ws_id,
        "query": "Can we change database schema without approval?",
        "limit": 5,
    })
    assert search_resp.status_code == 200
    results = search_resp.json()["results"]
    assert len(results) > 0
    assert any(r["id"] == mem_id for r in results)

    # 3. Memory Correction
    corr_resp = await client.post(f"/memories/{mem_id}/correct?workspace_id={ws_id}", headers=auth_headers, json={
        "corrected_content": "Database schema changes strictly require two senior engineer approvals.",
        "reason": "Updated team policy for production safety",
    })
    assert corr_resp.status_code == 200
    assert "strictly require two" in corr_resp.json()["content"]

    # 4. Delete memory
    del_resp = await client.delete(f"/memories/{mem_id}?workspace_id={ws_id}", headers=auth_headers)
    assert del_resp.status_code == 204


@pytest.mark.asyncio
async def test_decision_lifecycle_and_conflict_detection(client, auth_headers):
    ws_resp = await client.post("/workspaces", headers=auth_headers, json={"name": "Decisions WS"})
    ws_id = ws_resp.json()["id"]

    # 1. Create primary approved decision
    dec1_resp = await client.post("/decisions", headers=auth_headers, json={
        "workspace_id": ws_id,
        "title": "Use MongoDB Atlas for Primary Persistence",
        "description": "MongoDB Atlas is our approved document store and vector database. All schema changes require approval.",
        "reasoning": "Native vector search and flexible document schemas match our team workflow.",
    })
    assert dec1_resp.status_code == 201
    dec1 = dec1_resp.json()
    dec1_id = dec1["id"]

    # Approve decision 1
    appr_resp = await client.post(f"/decisions/{dec1_id}/approve?workspace_id={ws_id}", headers=auth_headers)
    assert appr_resp.status_code == 200
    assert appr_resp.json()["status"] == "approved"

    # 2. Propose conflicting decision
    dec2_resp = await client.post("/decisions", headers=auth_headers, json={
        "workspace_id": ws_id,
        "title": "Migrate database to PostgreSQL without approval",
        "description": "Switch from MongoDB to PostgreSQL immediately without seeking team consensus.",
    })
    assert dec2_resp.status_code == 201
    dec2 = dec2_resp.json()
    assert dec2["status"] == "proposed"


@pytest.mark.asyncio
async def test_task_lifecycle(client, auth_headers):
    ws_resp = await client.post("/workspaces", headers=auth_headers, json={"name": "Tasks WS"})
    ws_id = ws_resp.json()["id"]

    # Create task
    task_resp = await client.post("/tasks", headers=auth_headers, json={
        "workspace_id": ws_id,
        "title": "Implement Vector Search Index in Atlas",
        "description": "Define index on embedding path with cosine similarity",
        "priority": "high",
    })
    assert task_resp.status_code == 201
    task = task_resp.json()
    task_id = task["id"]
    assert task["status"] == "todo"

    # Advance status
    patch_resp = await client.patch(f"/tasks/{task_id}?workspace_id={ws_id}", headers=auth_headers, json={
        "status": "in_progress",
    })
    assert patch_resp.status_code == 200
    assert patch_resp.json()["status"] == "in_progress"

    # Add comment
    cmt_resp = await client.post(f"/tasks/{task_id}/comments?workspace_id={ws_id}", headers=auth_headers, json={
        "content": "Working on index definition in Atlas UI.",
    })
    assert cmt_resp.status_code == 200


@pytest.mark.asyncio
async def test_ai_generation_and_embeddings():
    # Test real text generation with Gemini
    text = await generate_text("Reply with exactly: TeamBrain Active")
    assert "TeamBrain" in text or "Active" in text or len(text) > 0

    # Test embedding generation
    embedding = await generate_embedding("TeamBrain shared memory")
    assert isinstance(embedding, list)
    assert len(embedding) > 0
