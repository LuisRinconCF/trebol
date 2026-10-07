#!/usr/bin/env python3
"""macOS output PTY: real child status, no terminal-input echo, bounded drain.

Child stays in the launcher's process group so the Node owner can cancel both.
Python is an optional macOS capability; callers fall back to pipes if absent.
"""
import errno
import os
import select
import subprocess
import sys
import time

master, slave = os.openpty()
try:
    child = subprocess.Popen(sys.argv[1:], stdin=subprocess.DEVNULL, stdout=slave, stderr=slave)
finally:
    os.close(slave)
ended = None
try:
    while True:
        status = child.poll()
        if status is not None and ended is None:
            ended = time.monotonic()
        if ended is not None and time.monotonic() - ended >= 0.2:
            break  # descendants holding the PTY must not strand completion
        if not select.select([master], [], [], 0.05)[0]:
            continue
        try:
            data = os.read(master, 65536)
        except OSError as error:
            if error.errno == errno.EIO:
                break
            raise
        if not data:
            break
        sys.stdout.buffer.write(data)
        sys.stdout.buffer.flush()
finally:
    os.close(master)
status = child.wait()
sys.exit(128 - status if status < 0 else status)
