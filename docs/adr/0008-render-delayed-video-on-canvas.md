# Render delayed video on canvas

ML Censored playback renders the viewer-facing video from a delayed frame buffer on a canvas while the source video continues to feed speech recognition. The audio path uses the same delay. If the browser or media cannot be rendered to canvas, the extension removes the delayed graph and overlay, restores ordinary playback, and reports an error.

This is the only browser-native mechanism available to the content script for keeping a locally delayed presentation in step with delayed audio. It can fail for protected media, so fail-open behaviour preserves normal YouTube playback rather than showing an out-of-sync or blank player.
