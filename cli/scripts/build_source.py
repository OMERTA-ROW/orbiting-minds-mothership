"""Build unsigned offline source archives. No installation, signing or uploads."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import zipfile

TARGETS = [(system, arch) for system in ("darwin", "linux", "windows") for arch in ("amd64", "arm64")]

def build(out, go):
    if not out.is_absolute() or out.exists() or not out.parent.is_dir():
        raise ValueError("Choose a new absolute staging directory with an existing parent")
    out.mkdir(mode=0o700)
    root = Path(__file__).resolve().parents[1]
    manifest = {"kind": "UNSIGNED_SOURCE_ONLY", "version": "0.0.0-source", "signed": False, "published": False, "artifacts": []}
    for system, arch in TARGETS:
        target = out / f"{system}-{arch}"
        target.mkdir()
        filename = "evolution.exe" if system == "windows" else "evolution"
        binary = target / filename
        env = {**os.environ, "GOOS": system, "GOARCH": arch, "CGO_ENABLED": "0"}
        subprocess.run([go, "build", "-trimpath", "-buildvcs=false", "-ldflags=-s -w -buildid=", "-o", str(binary), "./cmd/evolution"], cwd=root, env=env, check=True)
        archive = out / f"evolution-source-{system}-{arch}.zip"
        entries = {filename: binary.read_bytes(), "README.md": (root / "README.md").read_bytes(), "UNSIGNED.txt": b"UNSIGNED SOURCE ONLY. NOT A SIGNED OR PUBLISHED RELEASE. NO MODEL OR CONNECTOR.\n"}
        with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED) as z:
            for name, data in entries.items():
                info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = (0o100700 if name == filename else 0o100600) << 16
                z.writestr(info, data)
        manifest["artifacts"].append({"target": f"{system}/{arch}", "file": archive.name, "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(), "binary_sha256": hashlib.sha256(binary.read_bytes()).hexdigest(), "signed": False})
    (out / "source-manifest.json").write_text(json.dumps(manifest, indent=2)+"\n")
    (out / "SHA256SUMS").write_text("".join(f"{a['sha256']}  {a['file']}\n" for a in manifest["artifacts"]))
    print("Built six unsigned source archives; no installation, signing or publication.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--go", default="go")
    args = parser.parse_args()
    build(args.out, args.go)