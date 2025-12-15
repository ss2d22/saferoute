"""Authentication endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.exceptions import SafeRouteException
from app.db.base import get_db
from app.dependencies import get_current_user_dependency
from app.schemas.auth import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from app.services.auth_service import AuthService

router = APIRouter()


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    request: RegisterRequest,
    db: Session = Depends(get_db),
):
    """Register a new user."""
    try:
        auth_service = AuthService(db)
        user = auth_service.register(email=request.email, password=request.password)
        return UserResponse(
            id=str(user.id),
            email=user.email,
            is_active=user.is_active,
            settings=user.settings,
            created_at=user.created_at,
        )
    except SafeRouteException as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.post("/login", response_model=TokenResponse)
async def login(
    request_data: LoginRequest,
    http_request: Request,
    db: Session = Depends(get_db),
):
    """Login user and return tokens."""
    try:
        # Get IP and user agent from request
        ip_address = http_request.client.host if http_request.client else None
        user_agent = http_request.headers.get("user-agent")

        auth_service = AuthService(db)
        access_token, refresh_token, expires_in = auth_service.login(
            email=request_data.email,
            password=request_data.password,
            ip_address=ip_address,
            user_agent=user_agent,
        )

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in=expires_in,
        )
    except SafeRouteException as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: RefreshRequest,
    db: Session = Depends(get_db),
):
    """Refresh access token using refresh token."""
    try:
        auth_service = AuthService(db)
        access_token, new_refresh_token, expires_in = auth_service.refresh(
            refresh_token=request.refresh_token
        )

        return TokenResponse(
            access_token=access_token,
            refresh_token=new_refresh_token,
            token_type="bearer",
            expires_in=expires_in,
        )
    except SafeRouteException as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.post("/logout")
async def logout(
    request: RefreshRequest,
    db: Session = Depends(get_db),
):
    """Logout user by revoking refresh token."""
    try:
        auth_service = AuthService(db)
        auth_service.logout(refresh_token=request.refresh_token, revoke_all=False)
        return {"message": "Logged out successfully"}
    except SafeRouteException as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/me", response_model=UserResponse)
async def get_current_user(
    current_user=Depends(get_current_user_dependency),
):
    """Get current authenticated user info."""
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        is_active=current_user.is_active,
        settings=current_user.settings,
        created_at=current_user.created_at,
    )
