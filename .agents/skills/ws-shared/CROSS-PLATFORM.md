# Cross-platform runtime contract

Applies to shipped recipes and temporary scripts on Windows, Linux, and macOS.

## Python UTF-8

1. Pass `encoding="utf-8"` on every text file read and write.
2. Launch scripts that print non-ASCII with `python -X utf8`, set `PYTHONIOENCODING=utf-8`, or configure UTF-8 stdout in the script.
3. Prefer ASCII-only output for short-lived diagnostic helpers.

## Commands and quoting

1. Create script files with the host file-writing capability, not shell redirection.
2. Route commands with nested quotes, JSON, or multiline source through a temporary script and an explicit launcher.
3. In bash, use a quoted heredoc delimiter when a heredoc is unavoidable.
4. Do not paste shell-specific operators into another shell dialect.
5. Keep each uncertain shell call to one simple invocation.

## Managed scripts

1. Invoke `*.py` with `python`, `*.cjs` and `*.js` with `node`, and `*.sh` with `bash`.
2. Run configured consumer verification strings unchanged.
3. Report a launcher or dialect failure instead of rewriting a managed installed script.
