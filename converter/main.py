import os
import subprocess
import threading
import re
import datetime
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel
from typing import List, Optional

# Resolve input/output dirs from env
INPUT_DIR = Path(os.getenv("INPUT_DIR", "/data/input")).resolve()
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "/data/output")).resolve()

app = FastAPI()
jobs: dict[int, dict] = {}
job_id_counter = 0

class ConvertRequest(BaseModel):
    paths: List[str]               # relative paths under INPUT_DIR (files or directories)
    sample_rate: Optional[int] = None  # e.g. 44100 or 48000

@app.get("/", response_class=HTMLResponse)
async def index():
    return FileResponse(Path("static") / "index.html")

@app.get("/static/{file_path:path}")
async def static_files(file_path: str):
    full = Path("static") / file_path
    if full.is_file():
        return FileResponse(full)
    raise HTTPException(404, "Not Found")

@app.get("/api/list")
def list_dir(path: str = ""):
    base = (INPUT_DIR / path).resolve()
    if not str(base).startswith(str(INPUT_DIR)):
        raise HTTPException(400, "Invalid path")
    if not base.is_dir():
        raise HTTPException(404, "Directory not found")

    entries = []
    for child in sorted(base.iterdir()):
        name = child.name
        # Skip hidden files/directories (e.g. .DS_Store)
        if name.startswith('.'):
            continue

        # Always include directories
        if child.is_dir():
            entries.append({
                "name": name,
                "path": str((Path(path) / name).as_posix()),
                "is_dir": True
            })
        else:
            # Only include .flac files
            if child.suffix.lower() == ".flac":
                entries.append({
                    "name": name,
                    "path": str((Path(path) / name).as_posix()),
                    "is_dir": False
                })
    return entries

@app.post("/api/convert")
def convert(req: ConvertRequest):
    global job_id_counter
    job_id = job_id_counter
    job_id_counter += 1

    # Initialize job metadata
    jobs[job_id] = {
        "status": "queued",
        "log": [],
        "total": 0,
        "processed": 0,
        "errors": [],
        "start_time": None
    }

    def worker(jid: int, paths: List[str], sr: Optional[int]):
        jobs[jid]["status"] = "running"

        # 1) Expand selected directories into individual .flac files
        all_paths = set()
        for rel in paths:
            src = INPUT_DIR / rel
            if src.is_dir():
                # recursively find all .flac in this directory
                for f in src.rglob("*.flac"):
                    all_paths.add(str(f.relative_to(INPUT_DIR).as_posix()))
            elif src.is_file() and src.suffix.lower() == ".flac":
                all_paths.add(rel)
            else:
                jobs[jid]["log"].append(f"Skipping invalid path: {rel}")

        jobs[jid]["total"] = len(all_paths)
        jobs[jid]["processed"] = 0
        jobs[jid]["errors"] = []
        jobs[jid]["start_time"] = datetime.datetime.utcnow().isoformat()

        # 2) Process each .flac
        for rel_file in sorted(all_paths):
            try:
                # a) Build new filename stem with updated "(...kHz)" if needed
                rel_path = Path(rel_file)
                orig_stem = rel_path.stem
                if sr:
                    khz = f"{sr // 1000}kHz"
                    if re.search(r'\([^)]*kHz\)$', orig_stem):
                        new_stem = re.sub(r'\([^)]*kHz\)$', f"({khz})", orig_stem)
                    else:
                        new_stem = f"{orig_stem} ({khz})"
                else:
                    new_stem = orig_stem
                out_rel = rel_path.with_name(new_stem + ".m4a")

                # b) Prepare paths
                src_file = INPUT_DIR / rel_file
                dst_file = OUTPUT_DIR / out_rel
                dst_file.parent.mkdir(parents=True, exist_ok=True)

                # c) ffmpeg command: drop video, resample if asked, always 16-bit planar ALAC
                cmd = ["ffmpeg", "-y", "-i", str(src_file), "-vn"]
                if sr:
                    cmd += ["-ar", str(sr)]
                cmd += ["-sample_fmt", "s16p", "-c:a", "alac", str(dst_file)]

                jobs[jid]["log"].append(f"Converting {rel_file} → {out_rel}")
                result = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                if result.returncode != 0:
                    jobs[jid]["log"].append(f"ffmpeg exited with code {result.returncode}")
                    jobs[jid]["errors"].append(rel_file)
                else:
                    jobs[jid]["log"].append("Done.")
                jobs[jid]["processed"] += 1

            except Exception as e:
                jobs[jid]["log"].append(f"Exception processing {rel_file}: {e}")
                jobs[jid]["errors"].append(rel_file)
                jobs[jid]["processed"] += 1

        jobs[jid]["status"] = "finished"

    threading.Thread(target=worker, args=(job_id, req.paths, req.sample_rate), daemon=True).start()
    return {"job_id": job_id}

@app.get("/api/status/{job_id}")
def status(job_id: int):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job