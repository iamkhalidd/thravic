"""Zod-schema ports used by the routers.

Each module here mirrors one `validators/*.ts` file. The helpers in
`app/zod_lite.py` exist so that a validation failure produces byte-identical
`issues` output, since the frontends render those messages directly.
"""
