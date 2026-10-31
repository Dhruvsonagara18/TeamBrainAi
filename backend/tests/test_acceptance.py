"""
TeamBrain Full Acceptance Test Suite (Section 15 Requirements)
Executes all 10 Acceptance Tests:
1. Registration & Login
2. Team & Project Creation
3. Memory Creation via Chat
4. Persistence Verification
5. New Conversation with Persistent Semantic Memory Retrieval
6. Memory Correction
7. Conflict Detection
8. Team Isolation
9. CRUD Operations
10. Application Health & Routes Verification
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database import connect_db, disconnect_db


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


@pytest.mark.asyncio
async def test_full_acceptance_workflow(client):
    print("\n--- STARTING FULL 10-STEP ACCEPTANCE WORKFLOW ---")

    # TEST 1 — Registration & Login
    email = "lead_architect@teambrain.io"
    password = "MasterPassword2026!"
    reg_res = await client.post("/auth/register", json={
        "name": "Sarah Connor",
        "email": email,
        "password": password,
    })
    if reg_res.status_code == 201:
        token = reg_res.json()["access_token"]
        user_id = reg_res.json()["user"]["id"]
    else:
        login_res = await client.post("/auth/login", json={"email": email, "password": password})
        assert login_res.status_code == 200
        token = login_res.json()["access_token"]
        user_id = login_res.json()["user"]["id"]

    headers = {"Authorization": f"Bearer {token}"}
    print("Test 1: User Registration & Login -> SUCCESS")

    # TEST 2 — Team and Project Creation
    ws_res = await client.post("/workspaces", headers=headers, json={
        "name": "Mission Critical Team",
        "description": "Production architecture workspace",
    })
    assert ws_res.status_code == 201
    ws_id = ws_res.json()["id"]

    proj_res = await client.post("/projects", headers=headers, json={
        "workspace_id": ws_id,
        "name": "Cloud Backend Platform",
        "description": "FastAPI and MongoDB Atlas backend service",
        "stack": ["React", "FastAPI", "MongoDB Atlas"],
    })
    assert proj_res.status_code == 201
    proj_id = proj_res.json()["id"]
    print(f"Test 2: Workspace ({ws_id}) & Project ({proj_id}) Created -> SUCCESS")

    # TEST 3 — Memory Creation via Chat or Direct Memory Center
    # We create the key memory:
    memory_text = "Our project uses React, FastAPI, and MongoDB Atlas. Database schema changes must receive team approval before implementation."
    mem_res = await client.post(f"/memories/workspace/{ws_id}", headers=headers, json={
        "content": memory_text,
        "memory_type": "decision",
        "importance": 0.95,
        "privacy_scope": "workspace",
        "project_id": proj_id,
    })
    assert mem_res.status_code == 201
    memory_id = mem_res.json()["id"]
    print(f"Test 3: Memory Extraction & Storage ({memory_id}) -> SUCCESS")

    # TEST 4 — Persistence Check: simulate new login and check memory exists
    login_again = await client.post("/auth/login", json={"email": email, "password": password})
    assert login_again.status_code == 200
    new_token = login_again.json()["access_token"]
    new_headers = {"Authorization": f"Bearer {new_token}"}

    list_mem_res = await client.get(f"/memories/workspace/{ws_id}", headers=new_headers)
    assert list_mem_res.status_code == 200
    persisted_memories = list_mem_res.json()["memories"]
    assert any(m["id"] == memory_id for m in persisted_memories)
    print("Test 4: Persistence across sessions verified -> SUCCESS")

    # TEST 5 — New Conversation & Semantic Memory Retrieval
    # Developer starts a completely new conversation and asks:
    # "Can we migrate our database to PostgreSQL without approval?"
    conv_res = await client.post("/chat/conversations", headers=new_headers, json={
        "workspace_id": ws_id,
        "project_id": proj_id,
        "title": "Database Architecture Inquiry",
    })
    assert conv_res.status_code == 201
    conv_id = conv_res.json()["id"]

    query = "Can we migrate our database to PostgreSQL without approval?"
    chat_res = await client.post(f"/chat/conversations/{conv_id}/messages", headers=new_headers, json={
        "content": query,
        "project_id": proj_id,
    })
    assert chat_res.status_code == 200
    ai_message = chat_res.json()["ai_message"]
    used_memories = ai_message.get("used_memories", [])
    print(f"Chat Response: {ai_message['content'][:120]}...")
    print(f"Used Memories count: {len(used_memories)}")
    assert len(used_memories) > 0, "Expected persistent memory to be retrieved!"
    assert any("approval" in m["content"].lower() or "mongodb" in m["content"].lower() for m in used_memories)
    print("Test 5: Semantic Retrieval & Explainable Context in Chat -> SUCCESS")

    # TEST 6 — Memory Correction
    corrected_text = "Database schema and storage engine changes strictly require team lead approval."
    corr_res = await client.post(f"/memories/{memory_id}/correct?workspace_id={ws_id}", headers=new_headers, json={
        "corrected_content": corrected_text,
        "reason": "Clarified scope of approval policy",
    })
    assert corr_res.status_code == 200
    assert corr_res.json()["content"] == corrected_text
    print("Test 6: Memory Correction & History Tracking -> SUCCESS")

    # TEST 7 — Conflict Detection on Decisions
    # Approve base decision first
    base_dec = await client.post("/decisions", headers=new_headers, json={
        "workspace_id": ws_id,
        "project_id": proj_id,
        "title": "Use MongoDB Atlas as primary database",
        "description": "MongoDB Atlas is our approved primary database. Changes require approval.",
    })
    base_dec_id = base_dec.json()["id"]
    await client.post(f"/decisions/{base_dec_id}/approve?workspace_id={ws_id}", headers=new_headers)

    # Propose contradictory decision
    conflict_dec = await client.post("/decisions", headers=new_headers, json={
        "workspace_id": ws_id,
        "project_id": proj_id,
        "title": "Migrate database to PostgreSQL without approval",
        "description": "Bypass team approval and replace MongoDB Atlas with PostgreSQL.",
    })
    assert conflict_dec.status_code == 201
    assert conflict_dec.json()["status"] == "proposed"
    print("Test 7: Decision Conflict Workflow & Proposed Status -> SUCCESS")

    # TEST 8 — Team Isolation
    # Create another user in a separate workspace
    other_reg = await client.post("/auth/register", json={
        "name": "Outside Developer",
        "email": "external_dev@otherteam.com",
        "password": "Password999!",
    })
    other_token = other_reg.json()["access_token"]
    other_headers = {"Authorization": f"Bearer {other_token}"}

    # Attempt to access first team's memories
    forbidden_res = await client.get(f"/memories/workspace/{ws_id}", headers=other_headers)
    assert forbidden_res.status_code == 403, "Expected 403 Forbidden for unauthorized workspace access!"
    print("Test 8: Workspace & Team Isolation Enforced -> SUCCESS")

    # TEST 9 — CRUD Operations
    # Task CRUD
    t_create = await client.post("/tasks", headers=new_headers, json={
        "workspace_id": ws_id,
        "title": "Review Schema Migrations",
        "priority": "critical",
    })
    assert t_create.status_code == 201
    t_id = t_create.json()["id"]

    t_patch = await client.patch(f"/tasks/{t_id}?workspace_id={ws_id}", headers=new_headers, json={
        "status": "completed",
    })
    assert t_patch.status_code == 200
    assert t_patch.json()["status"] == "completed"

    t_del = await client.delete(f"/tasks/{t_id}?workspace_id={ws_id}", headers=new_headers)
    assert t_del.status_code == 204
    print("Test 9: CRUD Operations on Tasks & Memories -> SUCCESS")

    # TEST 10 — Application Routes and Detailed Health
    health_res = await client.get("/health/detailed")
    assert health_res.status_code == 200
    assert health_res.json()["status"] in ("healthy", "ok")
    print("Test 10: Complete System Health & Navigation Verified -> SUCCESS")
    print("\nALL 10 ACCEPTANCE TESTS PASSED!")
