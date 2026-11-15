import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
# the venv's lint-imports first, then PATH
LINT = shutil.which("lint-imports", path=str(Path(sys.executable).parent)) or shutil.which("lint-imports")


@pytest.mark.skipif(LINT is None, reason="import-linter is not installed")
def test_import_contracts_hold() -> None:
    result = subprocess.run([str(LINT)], cwd=ROOT, capture_output=True, text=True, check=False)
    assert result.returncode == 0, result.stdout + result.stderr
