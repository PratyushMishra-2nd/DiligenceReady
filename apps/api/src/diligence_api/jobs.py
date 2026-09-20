"""Work that outlives one HTTP request, because the proxy will not wait.

The dashboard reaches the API through Amplify's server-side rewrite, and
that proxy closes a request at around thirty seconds with a 504. Nothing in
the application can raise that ceiling: it is a property of the hosting tier
the browser talks to.

Two endpoints now sit above it. Since the model moved onto this instance
(see `llm.py`), an explanation is tens of seconds and a ledger question is a
multi-turn agent run on two vCPUs, which is regularly a minute. Both used to
answer in a couple of seconds on Bedrock and both now die in the proxy,
which the reader sees as "the agent could not be reached" on a request the
engine in fact completed.

So the shape of the request changes rather than the work. The POST starts
the job and returns an id immediately; the browser polls for the result.
Every HTTP hop is then well under the ceiling, whatever the model does, and
a slow answer is a slow answer rather than a failed one.

Deliberately in memory, and deliberately not Redis, SQS or a table:

*   There is one API process. A job is readable by exactly the process that
    started it, which is the process the poll reaches.
*   A job is a few hundred bytes of already-computed figures and lives for
    minutes. Durability buys nothing here: if the process restarts, the
    right answer is to ask again, not to resurrect a half-finished agent
    run.
*   Nothing in the product is *waiting* on one. Every figure on the page is
    already there; a job only ever produces prose about figures the engine
    computed before the job started.

What it does have to get right is ownership. A job id is a uuid4 and a poll
must present the same user, or it is a 404 — the same 404 a company in
another firm returns, for the same reason: a 403 would confirm the job
exists.
"""

from __future__ import annotations

import threading
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field

# Long enough that a slow agent run on a cold model is still collectable,
# short enough that a browser left open overnight is not holding answers in
# memory. Pruning happens when a job starts, so an idle process keeps
# nothing alive by ticking.
RETENTION_SECONDS = 15 * 60

# A ceiling on how many results are held at once, independent of age. One
# firm demonstrating the product to a room cannot grow this without bound.
MAX_JOBS = 256


@dataclass
class Job:
    id: str
    owner: str
    kind: str
    status: str = "running"  # running | done | failed
    result: dict | None = None
    error: str | None = None
    started: float = field(default_factory=time.monotonic)
    finished: float | None = None

    def body(self) -> dict:
        """What the poll endpoint returns.

        The result is spread at the top level rather than nested, so a
        caller that already knows the shape of a finished answer reads it
        the same way it did when the endpoint was synchronous.
        """
        payload: dict = {
            "job_id": self.id,
            "status": self.status,
            "elapsed_seconds": round((self.finished or time.monotonic()) - self.started, 1),
        }
        if self.status == "done" and self.result is not None:
            payload.update(self.result)
        if self.status == "failed":
            payload["error"] = self.error
        return payload


_lock = threading.Lock()
_jobs: dict[str, Job] = {}


def _prune() -> None:
    """Drop what nobody can still be waiting for. Caller holds the lock."""
    now = time.monotonic()
    stale = [
        key
        for key, job in _jobs.items()
        if job.finished is not None and now - job.finished > RETENTION_SECONDS
    ]
    for key in stale:
        del _jobs[key]

    if len(_jobs) > MAX_JOBS:
        # Oldest first, and finished jobs before running ones: a running job
        # still has somebody polling it.
        ordered = sorted(_jobs.values(), key=lambda job: (job.finished is None, job.started))
        for job in ordered[: len(_jobs) - MAX_JOBS]:
            _jobs.pop(job.id, None)


def start(owner: str, kind: str, work: Callable[[], dict]) -> Job:
    """Run `work` on a thread and return the job to poll for it.

    `work` returns the response body the endpoint would have returned. An
    exception inside it fails the job rather than the process: the panel
    that asked shows the failure, which is the same thing it would have
    shown for a 500, minus the 504 in front of it.
    """
    job = Job(id=str(uuid.uuid4()), owner=owner, kind=kind)

    with _lock:
        _prune()
        _jobs[job.id] = job

    def run() -> None:
        try:
            outcome = work()
        except Exception as error:  # noqa: BLE001 - the panel degrades, the process does not
            with _lock:
                job.status = "failed"
                # The class and message, not a traceback: this string is
                # shown to a signed-in user, and a traceback names paths.
                job.error = f"{type(error).__name__}: {error}"
                job.finished = time.monotonic()
            return
        with _lock:
            job.result = outcome
            job.status = "done"
            job.finished = time.monotonic()

    # Daemon, because a deploy restarting the container must not wait for a
    # model to finish a sentence.
    threading.Thread(target=run, name=f"job-{kind}", daemon=True).start()
    return job


def get(job_id: str, owner: str) -> Job | None:
    """The job, if it exists and belongs to this user. Otherwise nothing."""
    with _lock:
        job = _jobs.get(job_id)
    if job is None or job.owner != owner:
        return None
    return job
