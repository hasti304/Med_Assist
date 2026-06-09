import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { useLang } from '../context/LanguageContext';

export default function DailyTipsCard() {
  const { t } = useTranslation();
  const { lang } = useLang();
  const [tips, setTips] = useState([]);
  const [translatedTips, setTranslatedTips] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    if (lang !== 'es' || !tips.length) { setTranslatedTips(null); return; }
    const texts = Object.fromEntries(tips.map((tip, i) => [`tip_${i}`, tip]));
    api.post('/voice/translate', { lang, texts })
      .then((r) => {
        const result = tips.map((tip, i) => r.data[`tip_${i}`] || tip);
        setTranslatedTips(result);
      })
      .catch(() => {});
  }, [lang, tips]);

  const fetchTips = async (force = false) => {
    force ? setRefreshing(true) : setLoading(true);
    try {
      const url = force ? '/blood-report/daily-tips?force=true' : '/blood-report/daily-tips';
      const { data } = await api.get(url);
      if (!data.tips?.length) {
        setEmpty(true);
        return;
      }
      setTips(data.tips);
      setEmpty(false);
    } catch {
      // silent — card just stays as-is
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchTips(); }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow p-5 animate-pulse">
        <div className="h-3 w-32 bg-slate-100 rounded mb-4" />
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex items-start gap-3 mb-3">
            <div className="w-6 h-6 rounded-full bg-slate-100 shrink-0" />
            <div className="flex-1 h-3 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (empty) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow p-5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          {t('tips.title')}
        </p>
        <p className="text-sm text-slate-400">{t('tips.noTips')}</p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl border border-emerald-100 shadow p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-teal-700 uppercase tracking-wider">
          {t('tips.title')}
        </p>
        <button
          onClick={() => fetchTips(true)}
          disabled={refreshing}
          className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium transition-colors disabled:opacity-50"
          title="Generate fresh tips"
        >
          {refreshing ? (
            <span className="w-3 h-3 border-2 border-teal-500 border-t-transparent rounded-full animate-spin inline-block" />
          ) : (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          )}
          {t('tips.refresh')}
        </button>
      </div>
      <div className="space-y-3">
        {(translatedTips ?? tips).map((tip, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-teal-500 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
              {i + 1}
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">{tip}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
