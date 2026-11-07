"""Vercel-funktion: GET /api/status. All logik ligger i skoda_bridge/ (testad). Kräver Python 3.13."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from skoda_bridge.web import default_handler  # noqa: E402

handler = default_handler()
