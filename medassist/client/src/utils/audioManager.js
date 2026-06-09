// Global audio manager — ensures only one audio clip plays at any time across the entire app.
// Both the "Listen to Report" button and the chatbot use this so they never overlap.

let _audio = null;
let _onStop = null; // called when audio is interrupted by a new clip

export function playAudio(blobUrl, { onEnd, onStop } = {}) {
  // Always stop whatever is currently playing first
  if (_audio) {
    _audio.pause();
    if (_onStop) _onStop();
    _audio = null;
    _onStop = null;
  }

  const audio = new Audio(blobUrl);
  _audio = audio;
  _onStop = onStop || null;

  audio.onended = () => {
    _audio = null;
    _onStop = null;
    if (onEnd) onEnd();
  };

  audio.play().catch(() => {});
  return audio;
}

export function stopAudio() {
  if (_audio) {
    _audio.pause();
    if (_onStop) _onStop();
    _audio = null;
    _onStop = null;
  }
}
