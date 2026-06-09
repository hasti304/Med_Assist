/**
 * useVoice.js — ElevenLabs TTS + Browser Speech Recognition hook
 *
 * Usage:
 *   const { speak, listen, stopListening, isSpeaking, isListening, transcript, supported } = useVoice();
 *
 * speak(text)  — sends text to /api/voice/speak, plays audio
 * listen()     — starts SpeechRecognition, returns Promise<string>
 * stopListening() — cancels SpeechRecognition mid-stream
 */

import { useState, useRef, useCallback } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

export function useVoice() {
  const [isSpeaking,  setIsSpeaking]  = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript,  setTranscript]  = useState('');

  const audioCtxRef   = useRef(null);
  const audioSrcRef   = useRef(null);
  const recognitionRef = useRef(null);

  // Check browser support
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = !!SpeechRecognition;

  // ── Must be called synchronously inside a click handler (unlocks AudioContext) ──
  const initAudio = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();   // fire-and-forget is fine here
    }
  }, []);

  // ── Speak (TTS via ElevenLabs) ────────────────────────────────────────────
  const speak = useCallback(async (text) => {
    if (!text) return;

    // Stop any ongoing speech
    if (audioSrcRef.current) {
      try { audioSrcRef.current.stop(); } catch {}
      audioSrcRef.current = null;
    }

    setIsSpeaking(true);

    const speakWithBrowser = (script) => new Promise((resolve, reject) => {
      if (!window.speechSynthesis) {
        reject(new Error('Browser speech not supported'));
        return;
      }
      const utterance = new SpeechSynthesisUtterance(script);
      utterance.lang = document.documentElement.lang === 'es' ? 'es-ES' : 'en-US';
      utterance.rate = 0.95;
      utterance.onend = resolve;
      utterance.onerror = reject;
      window.speechSynthesis.speak(utterance);
    });

    try {
      const response = await api.post('/voice/speak', { text }, { responseType: 'arraybuffer', timeout: 8000 });

      const contentType = response.headers?.['content-type'] || '';
      if (contentType.includes('json') || contentType.includes('application/json')) {
        const data = JSON.parse(new TextDecoder().decode(response.data));
        if (data.mode === 'browser' && data.text) {
          await speakWithBrowser(data.text);
          return;
        }
      }

      // AudioContext must already exist (created by initAudio on click)
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') await ctx.resume();

      const audioBuffer = await ctx.decodeAudioData(response.data);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      audioSrcRef.current = source;

      await new Promise((resolve, reject) => {
        source.onended = resolve;
        source.onerror = reject;
        source.start(0);
      });
    } catch (err) {
      if (window.speechSynthesis) {
        try {
          await speakWithBrowser(text);
          return;
        } catch { /* fall through */ }
      }
      let msg = err.message;
      if (err?.response?.data instanceof ArrayBuffer) {
        try { msg = new TextDecoder().decode(err.response.data); } catch {}
      }
      console.error('[useVoice] TTS error:', msg);
      toast.error(`Voice error: ${msg}`, { id: 'tts-error', duration: 4000 });
    } finally {
      setIsSpeaking(false);
      audioSrcRef.current = null;
    }
  }, []);

  // ── Stop speech mid-play ─────────────────────────────────────────────────
  const stopSpeaking = useCallback(() => {
    if (audioSrcRef.current) {
      try { audioSrcRef.current.stop(); } catch {}
      audioSrcRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  // ── Listen (STT via browser Web Speech API) ──────────────────────────────
  const listen = useCallback((options = {}) => {
    const { lang = 'en-US', maxSeconds = 15 } = options;

    return new Promise((resolve, reject) => {
      if (!SpeechRecognition) {
        reject(new Error('Speech recognition not supported in this browser. Use Chrome or Edge.'));
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = lang;
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognitionRef.current = recognition;

      setIsListening(true);
      setTranscript('');

      // Guard against double-resolve (onresult + onend both firing)
      let settled = false;
      const settle = (fn, val) => {
        if (settled) return;
        settled = true;
        clearTimeout(stopTimer);
        clearTimeout(hardTimer);
        fn(val);
      };

      // Soft stop: ask recognition to finish after maxSeconds
      const stopTimer = setTimeout(() => {
        recognition.stop();
      }, maxSeconds * 1000);

      // Hard guard: if onend never fires (browser bug), force-resolve after maxSeconds + 5s
      const hardTimer = setTimeout(() => {
        try { recognition.abort(); } catch {}
        setIsListening(false);
        recognitionRef.current = null;
        settle(resolve, '');
      }, (maxSeconds + 5) * 1000);

      recognition.onresult = (event) => {
        const text = event.results[0][0].transcript;
        setTranscript(text);
        settle(resolve, text);
      };

      recognition.onerror = (event) => {
        setIsListening(false);
        if (event.error === 'no-speech') {
          settle(resolve, '');
        } else {
          settle(reject, new Error(`Speech recognition error: ${event.error}`));
        }
      };

      // onend fires when recognition stops — resolve with '' if onresult never came
      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
        settle(resolve, '');
      };

      recognition.start();
    });
  }, [SpeechRecognition]);

  // ── Stop listening ────────────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  // ── Browser TTS (language-aware, no backend) ──────────────────────────────
  const speakBrowser = useCallback((text, lang = 'en-US') => {
    return new Promise((resolve) => {
      if (!window.speechSynthesis || !text) { resolve(); return; }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = 0.95;
      utterance.pitch = 1;

      const voices = window.speechSynthesis.getVoices();
      const match = voices.find(
        (v) => v.lang.startsWith(lang.split('-')[0]) && !v.name.includes('Google') === false
      ) || voices.find((v) => v.lang.startsWith(lang.split('-')[0]));
      if (match) utterance.voice = match;

      utterance.onend = resolve;
      utterance.onerror = resolve;
      setIsSpeaking(true);
      utterance.onend = () => { setIsSpeaking(false); resolve(); };
      utterance.onerror = () => { setIsSpeaking(false); resolve(); };
      window.speechSynthesis.speak(utterance);
    });
  }, []);

  const stopBrowserSpeaking = useCallback(() => {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  // ── Parse spoken text with Groq via backend ───────────────────────────────
  const parseSpoken = useCallback(async (step, text, symptomName) => {
    if (!text) return null;
    const body = { step, text };
    if (symptomName) body.symptomName = symptomName;
    const { data } = await api.post('/voice/parse', body);
    return data.parsed;
  }, []);

  return {
    speak,
    stopSpeaking,
    speakBrowser,
    stopBrowserSpeaking,
    listen,
    stopListening,
    parseSpoken,
    initAudio,
    isSpeaking,
    isListening,
    transcript,
    supported,
  };
}
