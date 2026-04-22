"""
GitHub Actions worker: convert pending pdf2md_jobs.

Flow per job:
  1. Download PDF from Supabase Storage `pdf-uploads/<id>.pdf`
  2. Run PDF2MD conversion (installed from GitHub)
  3. Upload result markdown to `pdf-md-results/<id>.md` (public bucket)
  4. Update job row: status='done', result_url=<public URL>

On any error: status='error', error_msg=<message>
"""
from __future__ import annotations
import io
import os
import sys
import tempfile
from pathlib import Path

import requests

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}


# ── Supabase REST helpers ─────────────────────────────────────────────────────

def sb_select(table: str, eq: dict) -> list:
    params = "&".join(f"{k}=eq.{v}" for k, v in eq.items())
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{table}?{params}",
                     headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()


def sb_update(table: str, eq: dict, data: dict) -> None:
    params = "&".join(f"{k}=eq.{v}" for k, v in eq.items())
    r = requests.patch(f"{SUPABASE_URL}/rest/v1/{table}?{params}",
                       headers=HEADERS, json=data, timeout=30)
    r.raise_for_status()


def sb_storage_download(bucket: str, path: str) -> bytes:
    """Download a file from Supabase Storage (service-role signed URL)."""
    r = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/sign/{bucket}/{path}",
        headers=HEADERS,
        json={"expiresIn": 300},
        timeout=30,
    )
    r.raise_for_status()
    signed_url = SUPABASE_URL + r.json()["signedURL"]
    dl = requests.get(signed_url, timeout=120)
    dl.raise_for_status()
    return dl.content


def sb_storage_upload(bucket: str, path: str, data: bytes, content_type: str) -> str:
    """Upload to public bucket, return public URL."""
    r = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/{bucket}/{path}",
        headers={**HEADERS, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    r.raise_for_status()
    return f"{SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}"


# ── Conversion ────────────────────────────────────────────────────────────────

def convert_pdf_to_md(pdf_bytes: bytes) -> str:
    """Use PDF2MD library to convert PDF bytes → Markdown string."""
    # Install PDF2MD from GitHub if not already available
    try:
        from pdf2md import convert, ConvertOptions  # type: ignore
    except ImportError:
        import subprocess
        subprocess.check_call([
            sys.executable, "-m", "pip", "install", "--quiet",
            "git+https://github.com/ChenyuHeee/PDF2MD.git",
        ])
        from pdf2md import convert, ConvertOptions  # type: ignore

    with tempfile.TemporaryDirectory() as tmpdir:
        pdf_path = Path(tmpdir) / "input.pdf"
        md_path = Path(tmpdir) / "output.md"
        pdf_path.write_bytes(pdf_bytes)
        convert(
            str(pdf_path),
            str(md_path),
            options=ConvertOptions(
                extract_images=False,   # images can't be embedded in marginlens docs
                extract_tables=True,
                table_format="gfm",
            ),
        )
        return md_path.read_text(encoding="utf-8")


# ── Main loop ─────────────────────────────────────────────────────────────────

def main() -> None:
    jobs = sb_select("pdf2md_jobs", {"status": "pending"})
    if not jobs:
        print("No pending pdf2md jobs.")
        return

    for job in jobs:
        job_id = job["id"]
        pdf_path = job["pdf_storage_path"]
        print(f"Processing job {job_id} …")

        # Mark as processing
        sb_update("pdf2md_jobs", {"id": job_id}, {"status": "processing"})

        try:
            pdf_bytes = sb_storage_download("pdf-uploads", pdf_path)
            markdown_text = convert_pdf_to_md(pdf_bytes)
            md_bytes = markdown_text.encode("utf-8")

            result_path = f"{job_id}.md"
            result_url = sb_storage_upload(
                "pdf-md-results", result_path, md_bytes, "text/markdown; charset=utf-8"
            )
            sb_update("pdf2md_jobs", {"id": job_id}, {
                "status": "done",
                "result_url": result_url,
            })
            print(f"  ✓ done → {result_url}")

        except Exception as exc:
            print(f"  ✗ error: {exc}", file=sys.stderr)
            sb_update("pdf2md_jobs", {"id": job_id}, {
                "status": "error",
                "error_msg": str(exc)[:500],
            })


if __name__ == "__main__":
    main()
