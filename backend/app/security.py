import bcrypt
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import get_settings
from app.database import get_db
from bson import ObjectId

settings = get_settings()

bearer_scheme = HTTPBearer(auto_error=False)

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    pwd_bytes = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8")[:72], hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=ALGORITHM)


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return {}


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db=Depends(get_db),
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not credentials:
        raise credentials_exception
    payload = decode_token(credentials.credentials)
    user_id: str = payload.get("sub")
    if not user_id or payload.get("type") != "access":
        raise credentials_exception
    if db is None:
        raise HTTPException(status_code=503, detail="Database not configured")
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise credentials_exception
    return user


async def get_workspace_member(
    workspace_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    member = await db.workspace_members.find_one(
        {"workspace_id": workspace_id, "user_id": str(current_user["_id"])}
    )
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this workspace")
    return member


def require_role(*roles: str):
    async def checker(
        workspace_id: str,
        current_user: dict = Depends(get_current_user),
        db=Depends(get_db),
    ):
        member = await db.workspace_members.find_one(
            {"workspace_id": workspace_id, "user_id": str(current_user["_id"])}
        )
        if not member or member["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return member
    return checker
