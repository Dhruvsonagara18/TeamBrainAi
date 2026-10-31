from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel
from app.config import get_settings
import logging

logger = logging.getLogger(__name__)

settings = get_settings()

client: AsyncIOMotorClient | None = None
db = None


async def connect_db():
    global client, db
    if settings.mongodb_uri:
        try:
            client = AsyncIOMotorClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000)
            await client.admin.command("ping")
            db = client[settings.database_name]
            await create_indexes()
            logger.info("✅ Connected to MongoDB Atlas: %s", settings.database_name)
            return
        except Exception as exc:
            logger.warning("❌ MongoDB Atlas connection failed (%s). Falling back to in-memory engine.", exc)

    try:
        from mongomock_motor import AsyncMongoMockClient
        client = AsyncMongoMockClient()
        db = client[settings.database_name]
        logger.info("⚡ Using in-memory MongoDB engine. Ready for development. Set MONGODB_URI to connect to Atlas.")
    except Exception as exc:
        logger.error("❌ Failed to initialize in-memory database: %s", exc)
        client = None
        db = None


async def disconnect_db():
    global client
    if client:
        client.close()
        logger.info("MongoDB connection closed.")


def get_db():
    return db


async def create_indexes():
    if db is None:
        return
    try:
        # users
        await db.users.create_indexes([
            IndexModel([("email", ASCENDING)], unique=True),
            IndexModel([("created_at", DESCENDING)]),
        ])
        # workspaces
        await db.workspaces.create_indexes([
            IndexModel([("slug", ASCENDING)], unique=True),
            IndexModel([("owner_id", ASCENDING)]),
        ])
        # workspace_members
        await db.workspace_members.create_indexes([
            IndexModel([("workspace_id", ASCENDING), ("user_id", ASCENDING)], unique=True),
            IndexModel([("user_id", ASCENDING)]),
        ])
        # projects
        await db.projects.create_indexes([
            IndexModel([("workspace_id", ASCENDING)]),
            IndexModel([("created_at", DESCENDING)]),
        ])
        # conversations
        await db.conversations.create_indexes([
            IndexModel([("workspace_id", ASCENDING), ("user_id", ASCENDING)]),
            IndexModel([("updated_at", DESCENDING)]),
        ])
        # messages
        await db.messages.create_indexes([
            IndexModel([("conversation_id", ASCENDING), ("created_at", ASCENDING)]),
        ])
        # memories
        await db.memories.create_indexes([
            IndexModel([("workspace_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("user_id", ASCENDING)]),
            IndexModel([("project_id", ASCENDING)]),
            IndexModel([("memory_type", ASCENDING)]),
            IndexModel([("created_at", DESCENDING)]),
        ])
        # decisions
        await db.decisions.create_indexes([
            IndexModel([("workspace_id", ASCENDING)]),
            IndexModel([("project_id", ASCENDING)]),
            IndexModel([("status", ASCENDING)]),
            IndexModel([("created_at", DESCENDING)]),
        ])
        # tasks
        await db.tasks.create_indexes([
            IndexModel([("workspace_id", ASCENDING)]),
            IndexModel([("project_id", ASCENDING)]),
            IndexModel([("assignee_id", ASCENDING)]),
            IndexModel([("status", ASCENDING)]),
            IndexModel([("due_date", ASCENDING)]),
        ])
        # activity_logs
        await db.activity_logs.create_indexes([
            IndexModel([("workspace_id", ASCENDING), ("created_at", DESCENDING)]),
        ])
        # invitations
        await db.invitations.create_indexes([
            IndexModel([("token", ASCENDING)], unique=True),
            IndexModel([("email", ASCENDING)]),
        ])
        # memory_feedback
        await db.memory_feedback.create_indexes([
            IndexModel([("memory_id", ASCENDING)]),
            IndexModel([("user_id", ASCENDING)]),
        ])
        logger.info("✅ All MongoDB indexes created.")
    except Exception as e:
        logger.warning("Index creation note: %s", e)
