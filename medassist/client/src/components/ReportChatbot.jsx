import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLang } from '../context/LanguageContext';
import api from '../services/api';
import toast from 'react-hot-toast';
import { playAudio, stopAudio as stopGlobalAudio } from '../utils/audioManager';

let _uid = 0;
const uid = () => ++_uid;

export default function ReportChatbot({ reportId }) {
  const { t } = useTranslation();
  const { lang } = useLang();

  const SUGGESTIONS = [
    t('chatbot.suggestion1'),
    t('chatbot.suggestion2'),
    t('chatbot.suggestion3'),
    t('chatbot.suggestion4'),
  ];

  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([{
    id: uid(), role: 'assistant',
    text: t('chatbot.greeting'),
  }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [listening, setListening] = useState(false);
  const [playingId, setPlayingId] = useState(null);

  const bottomRef = useRef(null);
  const srRef = useRef(null);
  const textareaRef = useRef(null);
  const utteranceRef = useRef(null);

  // Update greeting when language changes
  useEffect(() => {
    setMsgs(prev => {
      const updated = [...prev];
      if (updated[0]?.role === 'assistant') {
        updated[0] = { ...updated[0], text: t('chatbot.greeting') };
      }
      return updated;
    });
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, open]);

  const stopLocalAudio = () => {
    stopGlobalAudio();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setPlayingId(null);
  };

  const playText = async (text, id) => {
    stopLocalAudio();

    // Spanish: use browser Web Speech API
    if (lang === 'es') {
      if (!window.speechSynthesis) {
        toast.error(t('chatbot.audioFailed'));
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-ES';
      utterance.rate = 0.92;
      const voices = window.speechSynthesis.getVoices();
      const esVoice = voices.find(v => v.lang.startsWith('es'));
      if (esVoice) utterance.voice = esVoice;
      utterance.onstart = () => setPlayingId(id);
      utterance.onend = () => { setPlayingId(null); utteranceRef.current = null; };
      utterance.onerror = () => { setPlayingId(null); utteranceRef.current = null; };
      utteranceRef.current = utterance;
      setPlayingId(id);
      window.speechSynthesis.speak(utterance);
      return;
    }

    // English: try ElevenLabs, fall back to browser SpeechSynthesis
    try {
      const res = await api.post('/voice/speak', { text }, { responseType: 'arraybuffer' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'audio/mpeg' }));
      setPlayingId(id);
      playAudio(url, {
        onEnd: () => { setPlayingId(null); URL.revokeObjectURL(url); },
        onStop: () => setPlayingId(null),
      });
    } catch {
      // ElevenLabs unavailable — fall back to browser TTS
      if (!window.speechSynthesis) { toast.error(t('chatbot.audioFailed')); return; }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.95;
      utterance.onstart = () => setPlayingId(id);
      utterance.onend = () => { setPlayingId(null); utteranceRef.current = null; };
      utterance.onerror = () => { setPlayingId(null); utteranceRef.current = null; };
      utteranceRef.current = utterance;
      setPlayingId(id);
      window.speechSynthesis.speak(utterance);
    }
  };

  const send = async (override) => {
    const text = (override ?? input).trim();
    if (!text || busy) return;
    setInput('');
    stopLocalAudio();

    const history = msgs.slice(1).map(({ role, text: content }) => ({ role, content }));
    const userMsg = { id: uid(), role: 'user', text };
    setMsgs(prev => [...prev, userMsg]);
    setBusy(true);

    try {
      const { data } = await api.post('/voice/report-chat', {
        reportId,
        message: text,
        history: history.slice(-10),
        lang,
      });
      const botMsg = { id: uid(), role: 'assistant', text: data.reply };
      setMsgs(prev => [...prev, botMsg]);
      if (autoSpeak) playText(data.reply, botMsg.id);
    } catch {
      const errMsg = { id: uid(), role: 'assistant', text: t('chatbot.error') };
      setMsgs(prev => [...prev, errMsg]);
      toast.error(t('chatbot.error'));
    } finally {
      setBusy(false);
    }
  };

  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast.error(t('chatbot.speechNotSupported')); return; }
    const r = new SR();
    srRef.current = r;
    r.lang = lang === 'es' ? 'es-ES' : 'en-US';
    r.interimResults = false;
    r.onstart = () => setListening(true);
    r.onresult = e => { setListening(false); send(e.results[0][0].transcript); };
    r.onerror = () => { setListening(false); toast.error(t('chatbot.couldntUnderstand')); };
    r.onend = () => setListening(false);
    r.start();
  };

  const stopListening = () => { srRef.current?.stop(); setListening(false); };

  const showSuggestions = msgs.length === 1;

  if (!reportId) return null;

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => { setOpen(o => !o); if (open) stopLocalAudio(); }}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-teal-600 hover:bg-teal-700 text-white shadow-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        title={t('chatbot.title')}
      >
        {open ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/>
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
          </svg>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-40 flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-slide-up"
          style={{ width: 380, maxWidth: 'calc(100vw - 3rem)', height: 520 }}
        >
          {/* ── Header ── */}
          <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-teal-600 to-teal-500 px-4 py-3 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z"/>
                </svg>
              </div>
              <div>
                <p className="text-white text-sm font-bold leading-tight">{t('chatbot.title')}</p>
                <p className="text-teal-100 text-[10px] leading-tight">{t('chatbot.subtitle')}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {/* Auto-speak toggle */}
              <button
                onClick={() => setAutoSpeak(v => !v)}
                title={autoSpeak ? t('chatbot.autoSpeakOn') : t('chatbot.autoSpeakOff')}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                  autoSpeak ? 'bg-white text-teal-600' : 'bg-white/10 text-white/70 hover:bg-white/20 text-white'
                }`}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  {autoSpeak ? (
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                  ) : (
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                  )}
                </svg>
              </button>
              {/* Close */}
              <button
                onClick={() => { setOpen(false); stopLocalAudio(); }}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>

          {/* ── Messages ── */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {msgs.map((m, idx) => (
              <div key={m.id}>
                <div className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {m.role === 'assistant' && (
                    <div className="w-7 h-7 bg-teal-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-3.5 h-3.5 text-teal-600" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z"/>
                      </svg>
                    </div>
                  )}
                  <div className={`flex flex-col gap-1 max-w-[82%] ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-teal-600 text-white rounded-tr-sm'
                        : 'bg-slate-100 text-slate-800 rounded-tl-sm'
                    }`}>
                      {m.text}
                    </div>
                    {/* Voice button for every assistant message */}
                    {m.role === 'assistant' && (
                      <button
                        onClick={() => playingId === m.id ? stopLocalAudio() : playText(m.text, m.id)}
                        className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-teal-600 transition-colors ml-1"
                      >
                        {playingId === m.id ? (
                          <>
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                              <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                            </svg>
                            {t('chatbot.stop')}
                          </>
                        ) : (
                          <>
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                            </svg>
                            {t('chatbot.listen')}
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Quick-reply chips under the first message only */}
                {idx === 0 && showSuggestions && (
                  <div className="mt-2 ml-9 flex flex-wrap gap-1.5">
                    {SUGGESTIONS.map(s => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        disabled={busy}
                        className="text-[11px] bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 rounded-full px-2.5 py-1 transition-colors disabled:opacity-50"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Typing indicator */}
            {busy && (
              <div className="flex gap-2 items-start">
                <div className="w-7 h-7 bg-teal-100 rounded-full flex items-center justify-center shrink-0">
                  <svg className="w-3.5 h-3.5 text-teal-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z"/>
                  </svg>
                </div>
                <div className="bg-slate-100 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                  {[0, 150, 300].map(d => (
                    <span key={d} className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* ── Input area ── */}
          <div className="shrink-0 border-t border-slate-100 p-3 space-y-2">
            {listening && (
              <div className="flex items-center gap-2 px-1">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse shrink-0" />
                <span className="text-xs font-medium text-red-600">{t('chatbot.listening')}</span>
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={t('chatbot.placeholder')}
                rows={1}
                disabled={busy}
                className="flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent disabled:opacity-50"
                style={{ maxHeight: 80 }}
              />
              {/* Mic button */}
              <button
                onClick={listening ? stopListening : startListening}
                disabled={busy}
                title={listening ? t('chatbot.stop') : t('chatbot.listening')}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all shrink-0 disabled:opacity-50 ${
                  listening
                    ? 'bg-red-500 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1 1.93c-3.94-.49-7-3.85-7-7.93h2c0 3.31 2.69 6 6 6s6-2.69 6-6h2c0 4.08-3.06 7.44-7 7.93V20h3v2H9v-2h3v-2.07z"/>
                </svg>
              </button>
              {/* Send button */}
              <button
                onClick={() => send()}
                disabled={busy || !input.trim()}
                title="Send"
                className="w-9 h-9 bg-teal-600 hover:bg-teal-700 text-white rounded-xl flex items-center justify-center transition-all shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
              </button>
            </div>
            <p className="text-[10px] text-center text-slate-400">{t('chatbot.disclaimer')}</p>
          </div>
        </div>
      )}
    </>
  );
}
