# backend/app/services/pdf_service.py
import logging
import io
from typing import Optional
import pdfplumber
from PyPDF2 import PdfReader

logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
MAX_PAGES = 10  # Limit pages to prevent abuse


async def extract_text_from_pdf(file_content: bytes) -> str:
    """Extract text from PDF using pdfplumber (better for complex layouts)"""
    if len(file_content) > MAX_FILE_SIZE:
        raise ValueError("File size exceeds 10MB limit")
    
    try:
        text_parts = []
        with pdfplumber.open(io.BytesIO(file_content)) as pdf:
            for i, page in enumerate(pdf.pages):
                if i >= MAX_PAGES:
                    logger.warning(f"PDF has more than {MAX_PAGES} pages, truncating")
                    break
                text = page.extract_text()
                if text:
                    text_parts.append(text)
        
        full_text = "\n".join(text_parts).strip()
        
        if not full_text or len(full_text) < 50:
            # Try PyPDF2 as fallback
            full_text = await extract_with_pypdf2(file_content)
        
        return full_text
    
    except Exception as e:
        logger.error(f"PDF extraction failed: {e}")
        raise ValueError(f"Could not read PDF: {str(e)}. Make sure the file contains selectable text (not a scanned image).")


async def extract_with_pypdf2(file_content: bytes) -> str:
    """Fallback PDF extraction using PyPDF2"""
    try:
        reader = PdfReader(io.BytesIO(file_content))
        text_parts = []
        for i, page in enumerate(reader.pages):
            if i >= MAX_PAGES:
                break
            text = page.extract_text()
            if text:
                text_parts.append(text)
        return "\n".join(text_parts).strip()
    except Exception as e:
        logger.error(f"PyPDF2 extraction failed: {e}")
        return ""


def validate_pdf(file_content: bytes) -> None:
    """Validate PDF file"""
    if len(file_content) > MAX_FILE_SIZE:
        raise ValueError("File must be under 10MB")
    
    # Check PDF magic bytes
    if not file_content.startswith(b"%PDF"):
        raise ValueError("Invalid PDF file")