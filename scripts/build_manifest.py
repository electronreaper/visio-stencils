#!/usr/bin/env python3
"""Build the stencil catalog from stencils/<Vendor>/*.(vss|vssx).

Writes docs/stencils.json and refreshes the generated vendor summary in
README.md. With --zips, also writes one archive per vendor for GitHub Pages.
Legacy .vss files are listed only. Modern .vssx packages are zip files;
master names and shape counts come from visio/masters/masters.xml.
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
import zipfile
from pathlib import Path
from urllib.parse import quote
from xml.etree import ElementTree as ET

# NameU values that are internal ids rather than labels a person would search for.
_ALIAS_SKIP = re.compile(r"(?:^com\.)|(?:[0-9a-f]{16,})")

REPO = "electronreaper/visio-stencils"
REF = "main"
RAW_BASE = f"https://raw.githubusercontent.com/{REPO}/{REF}/"
BLOB_BASE = f"https://github.com/{REPO}/blob/{REF}/"
TREE_BASE = f"https://github.com/{REPO}/tree/{REF}/"
SITE = f"https://{REPO.split('/')[0]}.github.io/{REPO.split('/')[1]}/"

# Filenames kept so download-URL encoding stays pinned to known awkward names.
ENCODING_FIXTURES = {
    "stencils/APC/APC - Cooling, Management and Networking.vssx": (
        RAW_BASE
        + "stencils/APC/APC%20-%20Cooling%2C%20Management%20and%20Networking.vssx"
    ),
    "stencils/STI/STI - ST[E]V-3101C.vss": (
        RAW_BASE + "stencils/STI/STI%20-%20ST%5BE%5DV-3101C.vss"
    ),
    "stencils/Premium-Line/Premium-Line Voice_&_Data Patch Panels.vss": (
        RAW_BASE
        + "stencils/Premium-Line/Premium-Line%20Voice_%26_Data%20Patch%20Panels.vss"
    ),
    "stencils/Cisco/Cisco Systems Catalyst 2950 (US units).vss": (
        RAW_BASE
        + "stencils/Cisco/Cisco%20Systems%20Catalyst%202950%20%28US%20units%29.vss"
    ),
}


def encode_path(path: str) -> str:
    """Percent-encode each path segment. Slashes stay separators.

    Spaces, brackets, ampersands, commas, and parentheses are encoded so raw
    GitHub URLs round-trip. quote() uses %20 rather than '+'.
    """
    return "/".join(quote(part, safe="") for part in path.split("/"))


def display_name(filename: str) -> str:
    """Turn a stencil filename into a readable title.

    Underscores become spaces. Hyphens become spaces only when the name is a
    hyphenated slug (no spaces). Names that already read as titles, including
    "Hewlett-Packard" and "Premium-Line", keep their hyphens.
    """
    stem = filename
    for ext in (".vssx", ".vss"):
        if stem.lower().endswith(ext):
            stem = stem[: -len(ext)]
            break
    stem = " ".join(stem.replace("_", " ").split())
    if " " not in stem:
        stem = " ".join(stem.replace("-", " ").split())
    return stem


def format_bytes(n: int) -> str:
    if n < 1024:
        return f"{n} B"
    if n < 1024 * 1024:
        value, unit = n / 1024, "KB"
    else:
        value, unit = n / (1024 * 1024), "MB"
    text = f"{value:.1f}".rstrip("0").rstrip(".")
    return f"{text} {unit}"


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def read_vssx_masters(path: Path) -> tuple[int, list[str], list[str]]:
    """Return (shape count, display names, alternate NameU values)."""
    try:
        with zipfile.ZipFile(path) as package:
            try:
                payload = package.read("visio/masters/masters.xml")
            except KeyError as exc:
                raise ValueError("missing visio/masters/masters.xml") from exc
    except zipfile.BadZipFile as exc:
        raise ValueError(f"not a zip package: {exc}") from exc
    try:
        root = ET.fromstring(payload)
    except ET.ParseError as exc:
        raise ValueError(f"masters.xml is not valid XML: {exc}") from exc

    shapes = 0
    masters: list[str] = []
    aliases: list[str] = []
    seen_alias: set[str] = set()
    for element in root.iter():
        if local_name(element.tag) != "Master":
            continue
        shapes += 1
        name = (element.attrib.get("Name") or "").strip()
        name_u = (element.attrib.get("NameU") or "").strip()
        shown = name or name_u
        if shown:
            masters.append(shown)
        if (
            name
            and name_u
            and name_u != name
            and name_u not in seen_alias
            and len(name_u) <= 80
            and not _ALIAS_SKIP.search(name_u)
        ):
            seen_alias.add(name_u)
            aliases.append(name_u)
    return shapes, masters, aliases


def discover(stencils_root: Path) -> list[dict]:
    if not stencils_root.is_dir():
        raise SystemExit(f"Missing stencil directory: {stencils_root}")

    found: list[dict] = []
    errors: list[str] = []
    for path in sorted(stencils_root.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(stencils_root).as_posix()
        parts = relative.split("/")
        if len(parts) < 2:
            print(f"warning: ignoring {path} (not inside a vendor folder)", file=sys.stderr)
            continue
        ext = path.suffix.lower()
        if ext not in (".vss", ".vssx"):
            print(f"warning: ignoring {relative} (not .vss or .vssx)", file=sys.stderr)
            continue
        vendor = parts[0]
        repo_path = f"stencils/{relative}"
        record = {
            "vendor": vendor,
            "file": path.name,
            "path": repo_path,
            "name": display_name(path.name),
            "format": ext[1:],
            "bytes": path.stat().st_size,
            "usUnits": "(US units)" in path.name,
            "shapes": None,
            "masters": [],
            "aliases": [],
            "downloadUrl": RAW_BASE + encode_path(repo_path),
            "githubUrl": BLOB_BASE + encode_path(repo_path),
        }
        if ext == ".vssx":
            try:
                shapes, masters, aliases = read_vssx_masters(path)
            except ValueError as exc:
                errors.append(f"{repo_path}: {exc}")
                continue
            record["shapes"] = shapes
            record["masters"] = masters
            record["aliases"] = aliases
        found.append(record)

    if errors:
        for message in errors:
            print(f"error: {message}", file=sys.stderr)
        raise SystemExit(1)

    found.sort(key=lambda item: (item["vendor"].casefold(), item["file"].casefold()))
    return found


def vendor_rows(stencils: list[dict]) -> list[dict]:
    grouped: dict[str, dict] = {}
    for stencil in stencils:
        row = grouped.get(stencil["vendor"])
        if row is None:
            row = {
                "name": stencil["vendor"],
                "count": 0,
                "vss": 0,
                "vssx": 0,
                "bytes": 0,
                "shapes": 0,
                "treeUrl": TREE_BASE + encode_path(f"stencils/{stencil['vendor']}"),
                "zip": encode_path(f"zips/{stencil['vendor']}.zip"),
            }
            grouped[stencil["vendor"]] = row
        row["count"] += 1
        row["bytes"] += stencil["bytes"]
        row[stencil["format"]] += 1
        if stencil["shapes"]:
            row["shapes"] += stencil["shapes"]
    return [grouped[name] for name in sorted(grouped, key=str.casefold)]


def build_manifest(stencils: list[dict]) -> dict:
    vendors = vendor_rows(stencils)
    return {
        "generator": "scripts/build_manifest.py",
        "repository": REPO,
        "ref": REF,
        "site": SITE,
        "totals": {
            "stencils": len(stencils),
            "vendors": len(vendors),
            "vss": sum(1 for item in stencils if item["format"] == "vss"),
            "vssx": sum(1 for item in stencils if item["format"] == "vssx"),
            "shapes": sum(item["shapes"] or 0 for item in stencils),
            "bytes": sum(item["bytes"] for item in stencils),
        },
        "vendors": vendors,
        "stencils": stencils,
    }


def dumps(manifest: dict) -> str:
    return json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"


def summary_markdown(manifest: dict) -> str:
    totals = manifest["totals"]
    return (
        f"**{totals['stencils']:,}** stencils from **{totals['vendors']}** vendors "
        f"(**{totals['vssx']}** modern `.vssx`, **{totals['vss']}** legacy `.vss`). "
        f"The `.vssx` packages contain **{totals['shapes']:,}** indexed shapes."
    )


def table_markdown(manifest: dict) -> str:
    lines = [
        "| Vendor | Stencils | .vssx | .vss | Shapes | Size |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for vendor in manifest["vendors"]:
        href = "stencils/" + encode_path(vendor["name"])
        shapes = f"{vendor['shapes']:,}" if vendor["vssx"] else "—"
        lines.append(
            "| "
            + " | ".join(
                [
                    f"[{vendor['name']}]({href})",
                    str(vendor["count"]),
                    str(vendor["vssx"]),
                    str(vendor["vss"]),
                    shapes,
                    format_bytes(vendor["bytes"]),
                ]
            )
            + " |"
        )
    totals = manifest["totals"]
    lines.append(
        "| "
        + " | ".join(
            [
                "**Total**",
                f"**{totals['stencils']}**",
                f"**{totals['vssx']}**",
                f"**{totals['vss']}**",
                f"**{totals['shapes']:,}**",
                f"**{format_bytes(totals['bytes'])}**",
            ]
        )
        + " |"
    )
    return "\n".join(lines)


def replace_marker(text: str, name: str, body: str) -> str:
    start = f"<!-- {name}:start -->"
    end = f"<!-- {name}:end -->"
    if start not in text or end not in text:
        raise SystemExit(f"README.md is missing {start} / {end} markers")
    pre, rest = text.split(start, 1)
    _, post = rest.split(end, 1)
    return f"{pre}{start}\n{body.rstrip()}\n{end}{post}"


def render_readme(text: str, manifest: dict) -> str:
    updated = replace_marker(text, "catalog-summary", summary_markdown(manifest))
    return replace_marker(updated, "catalog-table", table_markdown(manifest))


def write_or_check(path: Path, new_text: str, check: bool) -> bool:
    old_text = path.read_text(encoding="utf-8") if path.exists() else ""
    if old_text == new_text:
        print(f"up to date: {path}")
        return True
    if check:
        diff = "".join(
            difflib.unified_diff(
                old_text.splitlines(True),
                new_text.splitlines(True),
                fromfile=str(path),
                tofile=str(path) + " (generated)",
            )
        )
        print(diff[:12000])
        print(
            f"{path} is out of date. Run: python3 scripts/build_manifest.py",
            file=sys.stderr,
        )
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(new_text, encoding="utf-8")
    print(f"wrote {path}")
    return True


def write_zips(stencils_root: Path, vendors: list[dict], destination: Path) -> None:
    if (destination / "index.html").exists():
        raise SystemExit(f"Refusing to write zip archives into {destination}")
    destination.mkdir(parents=True, exist_ok=True)
    for stale in destination.glob("*.zip"):
        stale.unlink()
    for vendor in vendors:
        archive_path = destination / f"{vendor['name']}.zip"
        folder = stencils_root / vendor["name"]
        with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_STORED) as archive:
            files = sorted(path for path in folder.rglob("*") if path.is_file())
            if not files:
                raise SystemExit(f"No files to archive for {vendor['name']}")
            for file_path in files:
                relative = file_path.relative_to(stencils_root).as_posix()
                archive.write(file_path, relative)
        print(f"zip {archive_path.name} ({format_bytes(archive_path.stat().st_size)})")


def validate(manifest: dict, root: Path) -> None:
    by_path = {item["path"]: item for item in manifest["stencils"]}
    if len(by_path) != len(manifest["stencils"]):
        raise SystemExit("Duplicate stencil paths in the catalog")
    for path, expected in ENCODING_FIXTURES.items():
        item = by_path.get(path)
        if item is None:
            raise SystemExit(f"Encoding fixture is no longer in the repo: {path}")
        if item["downloadUrl"] != expected:
            raise SystemExit(
                f"Download URL encoding changed for {path}\n  {item['downloadUrl']}\n  {expected}"
            )
    forbidden = set(" []&,")
    for item in manifest["stencils"]:
        tail = item["downloadUrl"].split("/main/", 1)[-1]
        bad = forbidden.intersection(tail)
        if bad:
            raise SystemExit(f"Unencoded characters {bad!r} in {item['downloadUrl']}")
        if item["format"] == "vssx" and not item["shapes"]:
            raise SystemExit(f"No shapes indexed for {item['path']}")
        if item["format"] == "vss" and item["shapes"] is not None:
            raise SystemExit(f"Legacy stencil should not have a shape count: {item['path']}")
        for alias in item["aliases"]:
            if alias.startswith("com.") or len(alias) > 80:
                raise SystemExit(f"Unsearchable alias kept for {item['path']}: {alias}")
    totals = manifest["totals"]
    if totals["stencils"] != totals["vss"] + totals["vssx"]:
        raise SystemExit("Stencil totals do not add up")
    if totals["vendors"] != len(manifest["vendors"]):
        raise SystemExit("Vendor total does not match the vendor list")
    # Touch the files behind the fixtures so a renamed path fails loudly above.
    for path in ENCODING_FIXTURES:
        if not (root / path).is_file():
            raise SystemExit(f"Missing fixture file {path}")


def self_check() -> None:
    assert display_name("NetApp-ASA-Series.vssx") == "NetApp ASA Series"
    assert (
        display_name("APC - Cooling, Management and Networking.vssx")
        == "APC - Cooling, Management and Networking"
    )
    assert (
        display_name("Premium-Line Voice_&_Data Patch Panels.vss")
        == "Premium-Line Voice & Data Patch Panels"
    )
    assert display_name("Premium-Line FO HD Panels_96C_1U.vss") == (
        "Premium-Line FO HD Panels 96C 1U"
    )
    assert display_name("STI - ST[E]V-3101C.vss") == "STI - ST[E]V-3101C"
    assert display_name("Cohesity_12.2021.vss") == "Cohesity 12.2021"
    assert (
        display_name("Hewlett-Packard Proliant (US units).vss")
        == "Hewlett-Packard Proliant (US units)"
    )
    encoded = encode_path("stencils/Premium-Line/Premium-Line Voice_&_Data Patch Panels.vss")
    assert encoded.endswith("Voice_%26_Data%20Patch%20Panels.vss")
    assert "%2C" in encode_path("stencils/APC/APC - Cooling, Management and Networking.vssx")
    brackets = encode_path("stencils/STI/STI - ST[E]V-3101C.vss")
    assert "%5B" in brackets and "%5D" in brackets
    assert " " not in encode_path("stencils/Check Point/file name.vss")


def parse_args() -> argparse.Namespace:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=root, help="Repository root")
    parser.add_argument("--out", type=Path, default=None, help="Manifest path")
    parser.add_argument(
        "--zips",
        type=Path,
        default=None,
        help="Directory for per-vendor zip archives (omitted by default)",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Exit 1 if the manifest or README table is stale. Does not write.",
    )
    return parser.parse_args()


def main() -> int:
    self_check()
    args = parse_args()
    root = args.root.resolve()
    out = (args.out or (root / "docs" / "stencils.json")).resolve()
    readme_path = root / "README.md"
    stencils = discover(root / "stencils")
    manifest = build_manifest(stencils)
    validate(manifest, root)
    ok = write_or_check(out, dumps(manifest), args.check)
    readme = readme_path.read_text(encoding="utf-8")
    ok = write_or_check(readme_path, render_readme(readme, manifest), args.check) and ok
    totals = manifest["totals"]
    print(
        f"{totals['stencils']} stencils, {totals['vendors']} vendors, "
        f"{totals['shapes']} shapes, {format_bytes(totals['bytes'])}"
    )
    if args.zips:
        if args.check:
            raise SystemExit("--zips cannot be combined with --check")
        write_zips(root / "stencils", manifest["vendors"], args.zips.resolve())
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
