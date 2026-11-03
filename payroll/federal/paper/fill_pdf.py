#!/usr/bin/env python3
"""Fill an IRS fillable PDF from a {field name: value} mapping and fail closed.

    python3 payroll/federal/paper/fill_pdf.py --blank f941.pdf --spec spec.json --out filled.pdf

spec.json (written by payroll/federal/paper/forms.ts):
    {
      "form": "941",
      "revision": "Rev. 3-2026",            # text that must appear on the blank form
      "expectedFieldCount": 130,            # the blank must have exactly this many fields
      "text":    { "<full field name>": "value", ... },
      "checks":  [ "<full field name of a checkbox to tick>", ... ]
    }

It refuses (exit 2) if the blank is not the revision the mapping was written for, has a
different set of fields, or a named field does not exist. A form the IRS has revised must
be re-mapped by a person, never filled on a guess. Requires `pypdf` (watcher/requirements.txt).
"""
from __future__ import annotations

import argparse
import json
import sys

from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject


def full_name(obj) -> str:
    parts = []
    while obj is not None:
        obj = obj.get_object()
        if obj.get("/T") is not None:
            parts.append(str(obj["/T"]))
        obj = obj.get("/Parent")
    return ".".join(reversed(parts))


def widgets(reader: PdfReader):
    for pi, page in enumerate(reader.pages):
        for annot in page.get("/Annots", []) or []:
            a = annot.get_object()
            if a.get("/Subtype") == "/Widget":
                yield pi, a


def die(msg: str) -> None:
    print(f"REFUSED: {msg}", file=sys.stderr)
    sys.exit(2)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--blank", required=True)
    ap.add_argument("--spec", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    spec = json.load(open(args.spec))

    reader = PdfReader(args.blank)
    text = "\n".join((p.extract_text() or "") for p in reader.pages)
    if spec["revision"] not in text:
        die(f"the blank form does not say {spec['revision']!r}; the IRS has probably revised Form {spec['form']}. Re-map it before filling.")
    names = {full_name(a) for _, a in widgets(reader)}
    fields = reader.get_fields() or {}
    if len(fields) != spec["expectedFieldCount"]:
        die(f"the blank has {len(fields)} fields, the mapping was written for {spec['expectedFieldCount']}.")

    ticks = set(spec.get("checks", []))
    for name in list(spec.get("text", {})) + list(ticks):
        if name not in names:
            die(f"field {name!r} is not on the blank form.")

    writer = PdfWriter()
    writer.append(reader)
    # fill text fields page by page, addressing each widget by its full name
    for pi, page in enumerate(writer.pages):
        for annot in page.get("/Annots", []) or []:
            a = annot.get_object()
            if a.get("/Subtype") != "/Widget":
                continue
            n = full_name(a)
            if n in spec.get("text", {}):
                value = str(spec["text"][n])
                maxlen = a.get("/MaxLen") or (a["/Parent"].get_object().get("/MaxLen") if a.get("/Parent") else None)
                if maxlen is not None and len(value) > int(maxlen):
                    die(f"value {value!r} is longer than field {n!r} allows ({int(maxlen)}).")
                writer.update_page_form_field_values(page, {n: value}, auto_regenerate=False)
            elif n in ticks:
                on = [k for k in a["/AP"]["/N"].keys() if k != "/Off"][0]
                a[NameObject("/V")] = NameObject(on)
                a[NameObject("/AS")] = NameObject(on)
    writer.set_need_appearances_writer(True)
    with open(args.out, "wb") as fh:
        writer.write(fh)

    # Self-check: read the file back and confirm every value and tick is really in it.
    check = PdfReader(args.out)
    got = {full_name(a): a for _, a in widgets(check)}
    for name, value in spec.get("text", {}).items():
        v = got[name].get("/V")
        if v is None and got[name].get("/Parent") is not None:
            v = got[name]["/Parent"].get_object().get("/V")
        if str(v) != str(value):
            print(f"VERIFY FAILED: {name!r} reads back {v!r}, expected {value!r}", file=sys.stderr)
            sys.exit(3)
    for name in ticks:
        if str(got[name].get("/AS")) in ("None", "/Off"):
            print(f"VERIFY FAILED: checkbox {name!r} is not ticked", file=sys.stderr)
            sys.exit(3)
    print(f"wrote {args.out}: {len(spec.get('text', {}))} text fields, {len(ticks)} checkboxes, read back and verified")


if __name__ == "__main__":
    main()
