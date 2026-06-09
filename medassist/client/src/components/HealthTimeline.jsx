import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

export default function HealthTimeline() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/patient/timeline')
      .then((res) => setEvents(res.data.events || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow p-5 animate-pulse h-48" />
    );
  }

  if (!events.length) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow p-5">
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
        {t('dashboard.healthTimeline')}
      </h2>
      <div className="space-y-0 max-h-80 overflow-y-auto pr-1">
        {events.map((ev, i) => (
          <button
            key={`${ev.type}-${ev.date}-${i}`}
            type="button"
            onClick={() => ev.link && navigate(ev.link)}
            className="w-full text-left flex gap-3 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 rounded-lg px-1 transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center shrink-0 text-lg">
              {ev.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800">{ev.title}</p>
              {ev.detail && <p className="text-xs text-slate-500 mt-0.5 truncate">{ev.detail}</p>}
              <p className="text-[10px] text-slate-400 mt-1">
                {new Date(ev.date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
