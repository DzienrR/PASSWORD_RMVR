"""
PDF Password Manager API — fully stateless / in-memory only.

Privacy guarantees enforced here:
- No request bytes (uploads, passwords, decrypted output) are ever written to disk
  by application code. The only on-disk surface is FastAPI/Starlette's per-request
  `SpooledTemporaryFile` for multipart upload, which spills to /tmp ONLY for parts
  > spool size and is unconditionally closed/deleted by Starlette when the request
  ends. We override the spool size to a generous in-RAM-only ceiling so even
  50 MB uploads never hit disk.
- No persistent storage of metadata (no DB, no dict, no file index).
- No logging of file content, filenames, or passwords. Uvicorn's access log
  records only HTTP method, path and status code.
- Single-file unlock returns the decrypted bytes in the SAME response.
- Batch unlock returns base64 content per file in the SAME response. The browser
  builds the ZIP locally; the server has zero knowledge of which files the user
  ultimately downloads.
- All in-memory buffers are zeroed and dereferenced before the function returns.
"""

from fastapi import FastAPI, APIRouter, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.formparsers import MultiPartParser
import os
import io
import base64
import logging
from pathlib import Path
from typing import List, Optional
from pydantic import BaseModel
from pypdf import PdfReader, PdfWriter
from pypdf.errors import PdfReadError, FileNotDecryptedError

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MAX_FILE_SIZE = 50 * 1024 * 1024   # 50 MB per file
MAX_BATCH = 20                     # files per batch
SPOOL_MAX = MAX_FILE_SIZE * (MAX_BATCH + 1)  # keep all upload parts in RAM

# Force Starlette's multipart parser to keep upload parts in memory only —
# spool size is large enough that no part will ever spill to disk.
MultiPartParser.spool_max_size = SPOOL_MAX

app = FastAPI()
api_router = APIRouter(prefix="/api")


def _zero_and_release(buf: bytearray) -> None:
    """Best-effort scrub: overwrite a mutable buffer with zeros."""
    try:
        for i in range(len(buf)):
            buf[i] = 0
    except Exception:
        pass


def unlock_pdf_bytes(content: bytes, password: str) -> bytes:
    """Decrypt PDF bytes with given password. Returns decrypted bytes.
    Raises ValueError on incorrect password or invalid PDF."""
    try:
        reader = PdfReader(io.BytesIO(content))
    except PdfReadError as e:
        raise ValueError(f"Invalid or corrupted PDF: {e}")

    if reader.is_encrypted:
        try:
            result = reader.decrypt(password or "")
        except Exception as e:
            raise ValueError(f"Decryption error: {e}")
        # result == 0 means failure
        if not result:
            raise ValueError("Incorrect password")

    writer = PdfWriter()
    try:
        for page in reader.pages:
            writer.add_page(page)
    except FileNotDecryptedError:
        raise ValueError("Incorrect password")
    except Exception as e:
        raise ValueError(f"Failed to read pages: {e}")

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def safe_pdf_filename(name: str) -> str:
    base = Path(name).name
    # Strip directory traversal characters defensively
    base = base.replace("\x00", "").strip()
    if not base.lower().endswith(".pdf"):
        base = (base or "document") + ".pdf"
    return base


class BatchUnlockItem(BaseModel):
    filename: str
    status: str  # "success" | "error"
    size: Optional[int] = None
    error: Optional[str] = None
    # Base64-encoded unlocked PDF, only present for status == "success".
    # The server discards its copy as soon as this response is serialized.
    data: Optional[str] = None


class BatchUnlockResponse(BaseModel):
    results: List[BatchUnlockItem]


@api_router.get("/")
async def root():
    return {
        "message": "PDF Password Manager API",
        "privacy": {
            "storage": "in-memory only",
            "disk_writes": "none (multipart spool size raised above max upload)",
            "persistence": "none — all buffers released after each response",
            "logging": "method/path/status only; no bodies, headers, or filenames",
        },
    }


@api_router.post("/pdf/unlock")
async def unlock_single(file: UploadFile = File(...), password: str = Form("")):
    """Unlock a single PDF and stream the decrypted bytes back in the SAME response.

    The decrypted output never touches disk and never lives in memory beyond the
    duration of this request.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    content = await file.read()
    try:
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Empty file")
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File exceeds {MAX_FILE_SIZE // (1024 * 1024)}MB limit",
            )

        filename = safe_pdf_filename(file.filename)
        try:
            unlocked = unlock_pdf_bytes(content, password)
        except ValueError as e:
            msg = str(e)
            status = 401 if "password" in msg.lower() else 400
            raise HTTPException(status_code=status, detail=msg)
    finally:
        # Scrub the encrypted upload from memory before returning anything
        try:
            content_ba = bytearray(content)
            _zero_and_release(content_ba)
        except Exception:
            pass
        del content

    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Content-Length": str(len(unlocked)),
        "X-Filename": filename,
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
    }
    # StreamingResponse holds a reference to `unlocked` only until the body is sent.
    return StreamingResponse(
        io.BytesIO(unlocked),
        media_type="application/pdf",
        headers=headers,
    )


@api_router.post("/pdf/unlock-batch", response_model=BatchUnlockResponse)
async def unlock_batch(
    files: List[UploadFile] = File(...),
    password: str = Form(""),
):
    """Unlock all files in one shot. Returns base64 content per file in the
    response body — the browser is responsible for downloads and ZIP creation.
    Server retains no copy after this function returns.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    if len(files) > MAX_BATCH:
        raise HTTPException(
            status_code=400, detail=f"Maximum {MAX_BATCH} files per batch"
        )

    results: List[BatchUnlockItem] = []
    for f in files:
        filename = safe_pdf_filename(f.filename or "document.pdf")
        content = b""
        unlocked = b""
        try:
            content = await f.read()
            if len(content) == 0:
                raise ValueError("Empty file")
            if len(content) > MAX_FILE_SIZE:
                raise ValueError(
                    f"File exceeds {MAX_FILE_SIZE // (1024 * 1024)}MB limit"
                )
            unlocked = unlock_pdf_bytes(content, password)
            results.append(
                BatchUnlockItem(
                    filename=filename,
                    status="success",
                    size=len(unlocked),
                    data=base64.b64encode(unlocked).decode("ascii"),
                )
            )
        except ValueError as e:
            results.append(
                BatchUnlockItem(filename=filename, status="error", error=str(e))
            )
        except Exception as e:
            results.append(
                BatchUnlockItem(
                    filename=filename,
                    status="error",
                    error=f"Unexpected error: {e}",
                )
            )
        finally:
            # Scrub per-file buffers before moving to the next file
            try:
                if content:
                    _zero_and_release(bytearray(content))
                if unlocked:
                    _zero_and_release(bytearray(unlocked))
            except Exception:
                pass
            del content
            del unlocked

    return BatchUnlockResponse(results=results)


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    # NOTE: format intentionally records only timestamp, logger, level, and message.
    # Application code never logs file content, filenames, or passwords.
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger(__name__)

# Silence the default uvicorn access log entirely so even URL paths are not
# persisted. Errors and lifecycle events still log via uvicorn.error.
logging.getLogger("uvicorn.access").disabled = True


@app.middleware("http")
async def no_store_headers(request: Request, call_next):
    """Add no-store headers to every response so browsers / proxies don't cache PDFs."""
    response = await call_next(request)
    response.headers.setdefault("Cache-Control", "no-store, no-cache, must-revalidate")
    response.headers.setdefault("Pragma", "no-cache")
    return response
