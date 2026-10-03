# backend/app/api/v1/auth.py
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from typing import Optional
from app.core.security import create_access_token, get_current_user, get_current_user_optional
from app.services.supabase_service import supabase_service
from app.schemas.user import ProfileCreate, Profile
from app.schemas.common import ErrorResponse
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer(auto_error=False)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Profile


@router.post("/signup", response_model=AuthResponse, responses={400: {"model": ErrorResponse}})
async def signup(request: SignupRequest):
    """Sign up with email/password"""
    supabase = supabase_service.client
    
    try:
        # Create auth user
        auth_response = supabase.auth.admin.create_user({
            "email": request.email,
            "password": request.password,
            "email_confirm": True,
            "user_metadata": {"full_name": request.full_name} if request.full_name else {}
        })
        
        if not auth_response.user:
            raise HTTPException(status_code=400, detail="Failed to create user")
        
        user_id = auth_response.user.id
        
        # Create profile
        profile_data = {
            "user_id": user_id,
            "full_name": request.full_name or "",
            "email": request.email,
            "match_threshold": 70,
            "auto_apply": False,
            "onboarded": False,
        }
        profile = await supabase_service.create_profile(profile_data)
        
        # Create access token
        access_token = create_access_token({"sub": user_id})
        
        return AuthResponse(
            access_token=access_token,
            user=Profile(**profile)
        )
        
    except Exception as e:
        logger.error(f"Signup error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login", response_model=AuthResponse, responses={401: {"model": ErrorResponse}})
async def login(request: LoginRequest):
    """Login with email/password"""
    supabase = supabase_service.client
    
    try:
        auth_response = supabase.auth.sign_in_with_password({
            "email": request.email,
            "password": request.password,
        })
        
        if not auth_response.user or not auth_response.session:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        user_id = auth_response.user.id
        
        # Get or create profile
        profile = await supabase_service.get_profile(user_id)
        if not profile:
            profile_data = {
                "user_id": user_id,
                "full_name": auth_response.user.user_metadata.get("full_name", ""),
                "email": request.email,
                "match_threshold": 70,
                "auto_apply": False,
                "onboarded": False,
            }
            profile = await supabase_service.create_profile(profile_data)
        
        access_token = create_access_token({"sub": user_id})
        
        return AuthResponse(
            access_token=access_token,
            user=Profile(**profile)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(status_code=401, detail="Invalid credentials")


@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    """Logout (client-side token removal)"""
    supabase = supabase_service.client
    try:
        supabase.auth.sign_out()
    except:
        pass
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=Profile)
async def get_current_user_profile(current_user: dict = Depends(get_current_user)):
    """Get current user profile"""
    profile = await supabase_service.get_profile(current_user["user_id"])
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return Profile(**profile)


@router.post("/refresh", response_model=AuthResponse)
async def refresh_token(current_user: dict = Depends(get_current_user)):
    """Refresh access token"""
    access_token = create_access_token({"sub": current_user["user_id"]})
    profile = await supabase_service.get_profile(current_user["user_id"])
    return AuthResponse(access_token=access_token, user=Profile(**profile))