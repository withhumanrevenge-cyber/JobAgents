# backend/app/services/groq_service.py
import json
import logging
from typing import Optional, Dict, Any, List
from groq import Groq
from app.core.config import settings
from app.services.supabase_service import supabase_service

logger = logging.getLogger(__name__)


class GroqService:
    def __init__(self):
        self.client = Groq(api_key=settings.GROQ_API_KEY)
        self.fast_model = settings.GROQ_FAST_MODEL
        self.quality_model = settings.GROQ_QUALITY_MODEL

    async def call(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: int = 2048,
        temperature: float = 0.3,
        meter_user_id: Optional[str] = None
    ) -> str:
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})

        model_to_use = model or self.quality_model

        try:
            completion = self.client.chat.completions.create(
                model=model_to_use,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )

            content = completion.choices[0].message.content or ""
            
            # Log token usage if user_id provided
            if meter_user_id and completion.usage and completion.usage.total_tokens:
                await supabase_service.log_usage(
                    meter_user_id,
                    "ai_call",
                    credits=0,
                    tokens=completion.usage.total_tokens,
                    model=model_to_use
                )

            return content

        except Exception as e:
            logger.error(f"Groq API error: {e}")
            raise

    @staticmethod
    def parse_json(text: str) -> Optional[Dict[str, Any]]:
        """Parse JSON from Groq response, handling markdown code blocks"""
        try:
            # Remove markdown code blocks
            cleaned = text.strip()
            if cleaned.startswith("```"):
                # Find first { or [
                start = cleaned.find("{")
                if start == -1:
                    start = cleaned.find("[")
                if start != -1:
                    # Find matching closing bracket
                    if cleaned[start] == "{":
                        end = cleaned.rfind("}") + 1
                    else:
                        end = cleaned.rfind("]") + 1
                    cleaned = cleaned[start:end]
            
            return json.loads(cleaned)
        except json.JSONDecodeError:
            # Try to find JSON object in text
            import re
            match = re.search(r"[\[{][\s\S]*[\]}]", text)
            if match:
                try:
                    return json.loads(match.group(0))
                except json.JSONDecodeError:
                    pass
            return None


# Singleton
groq_service = GroqService()