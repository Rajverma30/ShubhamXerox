from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Deque, Dict


class PerPhoneRateLimiter:
    """
    Simple in-memory rate limiter: max_events per window_seconds per phone.
    NOTE: In multi-instance deployments, replace with Redis.
    """

    def __init__(self, max_events: int, window_seconds: int):
        self.max_events = max_events
        self.window_seconds = window_seconds
        self._events: Dict[str, Deque[float]] = defaultdict(deque)

    def allow(self, phone: str) -> bool:
        now = time.time()
        q = self._events[phone]
        cutoff = now - self.window_seconds
        while q and q[0] < cutoff:
            q.popleft()
        if len(q) >= self.max_events:
            return False
        q.append(now)
        return True

