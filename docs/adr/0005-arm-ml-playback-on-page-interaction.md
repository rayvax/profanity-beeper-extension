# Arm ML playback on the first page interaction

The Vosk model preloads without interaction, but the ML playback graph is created by the first ordinary click or keyboard event on YouTube, matching the PoC. No extension-specific action is required; until then the session reports that it is waiting and video remains uncensored. Research whether a supported MV3 mechanism can reliably enable the same Web Audio pipeline for autoplay playback without a page interaction.
