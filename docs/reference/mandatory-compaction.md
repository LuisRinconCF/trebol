# Mandatory context compaction

Pi-Swarm's context extension requests compaction after a completed turn whenever
Pi reports a known active-context token count of **330,000 or more**. This
fixed threshold is independent of the selected model's advertised context
window. Pi's reported token usage is used; unknown usage (`tokens: null` or a
missing usage object) is left alone because the extension cannot safely infer
an exact token count.

The extension calls Pi's supported `ExtensionContext.compact()` method, which
starts compaction asynchronously. Pi still requires an active model and its
normal compaction provider/authentication path; this setting does not enlarge
small model context windows or guarantee compaction when the provider fails.
The host may also compact earlier according to its own context-window reserve.
