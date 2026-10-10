"""Verify the downloaded datasets against their published checksums and extract only the
files this project uses into data/external/<dataset>/.

    python -I research/adapters/prepare_data.py --jump-zip <path to 28890545.zip> --rehab-dir <folder>

--jump-zip   the figshare "download all" archive of doi:10.6084/m9.figshare.28890545.v1
--rehab-dir  a folder holding 3d_joints.zip, Segmentation.csv, Segmentation.txt and
             joints_names.txt from doi:10.5281/zenodo.13305826

Each dataset gets its own folder and a SOURCE_MANIFEST.json recording the source files,
their published and computed MD5, and the SHA-256 of every extracted file. Nothing is
written if a checksum does not match. The downloads are treated as untrusted data: archive
member names are checked before extraction, and nothing in them is executed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import time
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CHECKSUMS = json.loads((REPO / "research" / "datasets" / "published_checksums.json").read_text(encoding="utf-8"))
JUMP_DIR = REPO / "data" / "external" / "jump_fatigue_figshare_28890545"
REHAB_DIR = REPO / "data" / "external" / "rehab24_6_zenodo_13305826"

# What this project uses from each dataset.
JUMP_OUTER_MEMBERS = [
    "Participants/participant_log.xlsx",
    "Data_processing/labeling_CMJ.xlsx",
    "Data_processing/Supplementary Material/description_markers.docx",
    "Data_processing/Matlab/figures.m",
    "Data_processing/Opensim/catelli_3dof_model.osim",
]
JUMP_INNER_MEMBERS = [
    "Kinematic_data/Joint_angles/CMJ.mat",
    "Kinematic_data/Joint_angles/IK_column_labels.xlsx",
]
REHAB_FILES = ["Segmentation.csv", "Segmentation.txt", "joints_names.txt"]
CHUNK = 8 * 1024 * 1024


def safe_name(name: str) -> str:
    p = Path(name)
    if p.is_absolute() or ".." in p.parts or name.startswith(("/", "\\")):
        raise SystemExit(f"refusing unsafe archive member name: {name!r}")
    return name


def digest(stream, algo: str) -> str:
    h = hashlib.new(algo)
    for block in iter(lambda: stream.read(CHUNK), b""):
        h.update(block)
    return h.hexdigest()


def sha256_file(path: Path) -> str:
    with open(path, "rb") as f:
        return digest(f, "sha256")


def copy_member(zf: zipfile.ZipFile, name: str, dest_root: Path) -> Path:
    dest = dest_root / safe_name(name)
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    with zf.open(name) as src, open(tmp, "wb") as out:
        shutil.copyfileobj(src, out, CHUNK)
    tmp.replace(dest)
    return dest


def verify(label: str, got_md5: str, size: int, published: dict) -> dict:
    ok = got_md5 == published["md5"] and size == published["bytes"]
    print(f"  {'ok ' if ok else 'BAD'} {label}: md5 {got_md5} (published {published['md5']}), {size:,} bytes", flush=True)
    if not ok:
        raise SystemExit(f"checksum mismatch for {label}; nothing extracted")
    return {"published_md5": published["md5"], "computed_md5": got_md5, "bytes": size}


def prepare_jump(zip_path: Path) -> None:
    pub = CHECKSUMS["jump_fatigue"]["files"]
    print(f"[jump] verifying {zip_path}", flush=True)
    manifest = {"dataset": "jump_fatigue", "doi": CHECKSUMS["jump_fatigue"]["doi"], "source_archive": str(zip_path),
                "verified": {}, "extracted": {}, "prepared_at": time.strftime("%Y-%m-%dT%H:%M:%S")}
    with zipfile.ZipFile(zip_path) as outer:
        names = {safe_name(n) for n in outer.namelist()}
        for member in [*JUMP_OUTER_MEMBERS, "Kinematic_data.zip"]:
            if member not in names:
                raise SystemExit(f"{member} is missing from {zip_path}")
            info = outer.getinfo(member)
            with outer.open(member) as f:
                manifest["verified"][member] = verify(member, digest(f, "md5"), info.file_size, pub[member])
        JUMP_DIR.mkdir(parents=True, exist_ok=True)
        for member in JUMP_OUTER_MEMBERS:
            dest = copy_member(outer, member, JUMP_DIR)
            manifest["extracted"][member] = {"sha256": sha256_file(dest), "bytes": dest.stat().st_size}
        with zipfile.ZipFile(outer.open("Kinematic_data.zip")) as inner:
            inner_names = {safe_name(n) for n in inner.namelist()}
            manifest["kinematic_zip_members"] = len(inner_names)
            for member in JUMP_INNER_MEMBERS:
                if member not in inner_names:
                    raise SystemExit(f"{member} is missing from Kinematic_data.zip")
                print(f"[jump] extracting {member}", flush=True)
                dest = copy_member(inner, member, JUMP_DIR)
                manifest["extracted"][member] = {"sha256": sha256_file(dest), "bytes": dest.stat().st_size}
    (JUMP_DIR / "SOURCE_MANIFEST.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"[jump] done: {JUMP_DIR}", flush=True)


def prepare_rehab(folder: Path) -> None:
    pub = CHECKSUMS["rehab24_6"]["files"]
    print(f"[rehab] verifying files in {folder}", flush=True)
    manifest = {"dataset": "rehab24_6", "doi": CHECKSUMS["rehab24_6"]["doi"], "source_folder": str(folder),
                "verified": {}, "extracted": {}, "prepared_at": time.strftime("%Y-%m-%dT%H:%M:%S")}
    for name in [*REHAB_FILES, "3d_joints.zip"]:
        path = folder / name
        if not path.exists():
            raise SystemExit(f"{path} is missing")
        with open(path, "rb") as f:
            manifest["verified"][name] = verify(name, digest(f, "md5"), path.stat().st_size, pub[name])
    REHAB_DIR.mkdir(parents=True, exist_ok=True)
    for name in REHAB_FILES:
        shutil.copyfile(folder / name, REHAB_DIR / name)
        manifest["extracted"][name] = {"sha256": sha256_file(REHAB_DIR / name), "bytes": (REHAB_DIR / name).stat().st_size}
    with zipfile.ZipFile(folder / "3d_joints.zip") as zf:
        members = [safe_name(n) for n in zf.namelist() if n.endswith("-30fps.npy")]
        print(f"[rehab] extracting {len(members)} 30 fps joint files", flush=True)
        for member in members:
            dest = copy_member(zf, member, REHAB_DIR / "3d_joints")
            manifest["extracted"][f"3d_joints/{member}"] = {"sha256": sha256_file(dest), "bytes": dest.stat().st_size}
    (REHAB_DIR / "SOURCE_MANIFEST.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"[rehab] done: {REHAB_DIR}", flush=True)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--jump-zip", type=Path)
    p.add_argument("--rehab-dir", type=Path)
    a = p.parse_args()
    if not a.jump_zip and not a.rehab_dir:
        p.error("give --jump-zip and/or --rehab-dir")
    if a.jump_zip:
        prepare_jump(a.jump_zip.resolve())
    if a.rehab_dir:
        prepare_rehab(a.rehab_dir.resolve())


if __name__ == "__main__":
    sys.exit(main())
