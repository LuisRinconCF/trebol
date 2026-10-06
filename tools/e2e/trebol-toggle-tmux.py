#!/usr/bin/env python3
"""Actual full-pack Pi terminal journey; no provider credentials or model turns."""
import json, os, pathlib, subprocess, tempfile, time
repo = pathlib.Path(__file__).resolve().parents[2]
name = f'trebol-e2e-{os.getpid()}'
def tmux(*args):
    return subprocess.check_output(['tmux', *args], text=True)
def wait_for(text):
    deadline = time.monotonic() + 40
    while time.monotonic() < deadline:
        pane = tmux('capture-pane', '-pt', name, '-S', '-200')
        if text in pane:
            return pane
        time.sleep(.2)
    raise AssertionError(f'Timed out waiting for {text}:\n{pane}')
with tempfile.TemporaryDirectory(prefix='trebol-tmux-') as temp:
    agent = pathlib.Path(temp) / 'agent'
    agent.mkdir()
    (agent / 'settings.json').write_text(json.dumps({'packages': [str(repo)]}))
    import shlex
    command = f'PI_CODING_AGENT_DIR={shlex.quote(str(agent))} pi --no-session'
    tmux('new-session', '-d', '-s', name, '-x', '140', '-y', '42', '-c', temp, command)
    try:
        wait_for('trebol:on')
        draft = 'UNSUBMITTED-draft-keep-789'
        tmux('send-keys', '-t', name, '-l', draft)
        for expected in ['Trebol OFF', 'trebol:on', 'Trebol OFF', 'trebol:on']:
            tmux('send-keys', '-t', name, 'C-n')
            pane = wait_for(expected)
            assert draft in pane, 'Draft lost'
            assert '/trebol-toggle' not in pane, 'Slash command leaked into transcript'
            assert 'Shortcut handler error' not in pane
        print('PASS tmux full pack: Ctrl+N OFF/ON twice, draft preserved, footer modes correct, no slash-command transcript')
    finally:
        tmux('kill-session', '-t', name)
