"""Write tests/fixtures/parity_shipped_fixture.json.

tests/parity.test.ts checks that the TypeScript detector matches the Python Lab for six
test configurations, none of which is the configuration the app actually ships. This
script builds the same kind of fixture for the shipped configuration
(public/breakingpoint_detector_config.json), so tests/parity_shipped.test.ts can check it
too. It imports the Lab's own fixture generator and changes nothing in lab/; the original
fixture (tests/fixtures/parity_fixture.json) is left untouched.

    python -I research/tools/make_shipped_parity_fixture.py
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "lab"))

from breakingpoint_lab import parity  # noqa: E402
from breakingpoint_lab.core import make_config  # noqa: E402

SHIPPED = REPO / "public" / "breakingpoint_detector_config.json"
OUT = REPO / "tests" / "fixtures" / "parity_shipped_fixture.json"
DETECTOR_KEYS = ("mode", "ewma_alpha", "cusum_k", "cusum_h", "warning_threshold", "breakpoint_threshold",
                 "minimum_persistent_reps", "outlier_clip", "z_clip", "feature_weighting", "missing_feature_handling",
                 "quality_min", "min_coverage", "reference")


def main() -> None:
    raw = SHIPPED.read_bytes()
    shipped = json.loads(raw)
    cfg = make_config(**{k: shipped[k] for k in DETECTOR_KEYS})
    parity.PARITY_CONFIGS = [cfg]  # the generator reads this list when it runs
    parity.make_fixture(OUT)
    payload = json.loads(OUT.read_text(encoding="utf-8"))
    payload["generated_by"] = "research/tools/make_shipped_parity_fixture.py (via lab/breakingpoint_lab/parity.py)"
    payload["config_source"] = {"path": "public/breakingpoint_detector_config.json", "config_id": shipped.get("config_id"),
                                "sha256": hashlib.sha256(raw).hexdigest()}
    OUT.write_text(json.dumps(payload, allow_nan=False), encoding="utf-8")
    print(f"wrote {OUT.relative_to(REPO)} for {shipped.get('config_id')}")


if __name__ == "__main__":
    main()
