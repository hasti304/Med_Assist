import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import HealthScoreCard from '../../components/HealthScoreCard';
import DailyTipsCard from '../../components/DailyTipsCard';
import LabTrendsCard from '../../components/LabTrendsCard';
import HealthTimeline from '../../components/HealthTimeline';
import ReportChatbot from '../../components/ReportChatbot';

function StandaloneReportCard({ report, index, onOpen, t }) {
  const date = new Date(report.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  return (
    <div
      className="bg-white rounded-2xl border border-slate-200 shadow p-5 hover:shadow-md hover:border-teal-200 transition-all cursor-pointer animate-slide-up"
      style={{ animationDelay: `${index * 60}ms` }}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${
              report.analyzed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}>
              {report.analyzed ? t('dashboard.statusAnalyzed') : t('dashboard.statusUploaded')}
            </span>
            <span className="text-xs text-slate-400">{date}</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-800">
            {report.total_parameters} {t('dashboard.parameters')}
          </p>
          {report.abnormal_count > 0 && (
            <p className="text-xs text-red-500 mt-0.5">
              {report.abnormal_count} {report.abnormal_count !== 1 ? t('dashboard.abnormalFindingsPlural') : t('dashboard.abnormalFindings')}
            </p>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
          className="shrink-0 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600
                     text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all shadow-sm whitespace-nowrap"
        >
          {report.analyzed ? t('dashboard.viewAnalysis') : t('dashboard.runAnalysis')}
        </button>
      </div>
    </div>
  );
}

export default function PatientDashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [standaloneReports, setStandaloneReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState([]);
  const [exportingPacket, setExportingPacket] = useState(false);

  useEffect(() => {
    api.get('/blood-report/standalone')
      .then((res) => setStandaloneReports(res.data.reports || []))
      .catch(() => toast.error('Could not load your reports'))
      .finally(() => setLoading(false));
    api.get('/patient/badges')
      .then((res) => setBadges(res.data.badges || []))
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Hero Header */}
      <div className="bg-gradient-to-br from-teal-700 via-teal-600 to-emerald-600 rounded-2xl shadow-lg p-6 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4" />
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold font-display">{t('dashboard.title')}</h1>
            <p className="text-teal-100 text-sm mt-1">
              {t('dashboard.subtitle')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => navigate('/patient/new-assist')}
              className="flex items-center gap-2 bg-white text-teal-700 font-bold px-5 py-3 rounded-xl
                         hover:bg-teal-50 transition-all text-sm whitespace-nowrap shadow-md hover:shadow-lg"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
              </svg>
              {t('nav.newAssist')}
            </button>
            <button
              onClick={() => navigate('/patient/upload-report')}
              className="flex items-center gap-2 bg-white/20 text-white font-bold px-5 py-3 rounded-xl
                         hover:bg-white/30 transition-all text-sm whitespace-nowrap border border-white/30"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              {t('dashboard.analyzeBtn')}
            </button>
          </div>
        </div>

        {/* Inline Stats */}
        {!loading && standaloneReports.length > 0 && (
          <div className="relative grid grid-cols-3 gap-3 mt-5">
            <div className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-3 text-center border border-white/10">
              <p className="text-2xl font-bold">{standaloneReports.length}</p>
              <p className="text-xs text-teal-100 mt-0.5">{t('dashboard.totalReports')}</p>
            </div>
            <div className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-3 text-center border border-white/10">
              <p className="text-2xl font-bold text-emerald-200">
                {standaloneReports.filter((r) => r.analyzed).length}
              </p>
              <p className="text-xs text-teal-100 mt-0.5">{t('dashboard.analyzed')}</p>
            </div>
            <div className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-3 text-center border border-white/10">
              <p className="text-2xl font-bold text-amber-200">
                {standaloneReports.find((r) => r.analyzed)?.abnormal_count || 0}
              </p>
              <p className="text-xs text-teal-100 mt-0.5">{t('dashboard.latestAbnormal')}</p>
            </div>
          </div>
        )}
      </div>

      {/* Health Score + Daily Tips + Lab trends */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <HealthScoreCard />
        <DailyTipsCard />
        <LabTrendsCard />
        <HealthTimeline />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={exportingPacket}
          onClick={async () => {
            setExportingPacket(true);
            try {
              const res = await api.get('/patient/export-health-packet', { responseType: 'blob' });
              const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
              const a = document.createElement('a');
              a.href = url;
              a.download = 'MedAssist_Health_Packet.pdf';
              a.click();
              URL.revokeObjectURL(url);
              toast.success(t('dashboard.packetExported'));
            } catch (e) {
              toast.error(e.message || 'Export failed');
            } finally {
              setExportingPacket(false);
            }
          }}
          className="text-sm font-semibold px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-xl disabled:opacity-50"
        >
          {exportingPacket ? t('common.loading') : t('dashboard.exportPacket')}
        </button>
      </div>

      {/* Ask MedAssist — uses latest analyzed report */}
      {!loading && (() => {
        const latest = [...standaloneReports]
          .filter((r) => r.analyzed)
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        return latest ? <ReportChatbot reportId={latest.id} /> : null;
      })()}

      {/* Engagement Badges */}
      {badges.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow p-5">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            {t('dashboard.achievements')}
          </h2>
          <div className="flex flex-wrap gap-3">
            {badges.map((badge) => (
              <div
                key={badge.id}
                className="flex items-center gap-2 bg-gradient-to-r from-slate-50 to-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm"
                title={badge.description}
              >
                <span className="text-xl">{badge.icon}</span>
                <span className="text-sm font-semibold text-slate-700">{badge.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          {[1, 2].map((n) => (
            <div key={n} className="bg-white rounded-2xl border border-slate-200 shadow p-5 animate-pulse">
              <div className="flex gap-3">
                <div className="h-5 w-24 bg-slate-100 rounded-lg" />
                <div className="h-5 w-20 bg-slate-100 rounded-lg" />
              </div>
              <div className="h-4 w-48 bg-slate-100 rounded mt-3" />
            </div>
          ))}
        </div>
      )}

      {/* Blood reports list */}
      {!loading && standaloneReports.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
            {t('dashboard.reportAnalyses')} ({standaloneReports.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {standaloneReports.map((r, i) => (
              <StandaloneReportCard
                key={r.id}
                report={r}
                index={i}
                t={t}
                onOpen={() => navigate(`/patient/analysis/${r.id}`)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && standaloneReports.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow p-12 text-center">
          <div className="w-20 h-20 bg-teal-50 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0 1 18 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3 1.5 1.5 3-3.75" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold font-display text-slate-700 mb-2">{t('dashboard.noReports')}</h2>
          <p className="text-sm text-slate-400 mb-6 max-w-sm mx-auto">
            {t('dashboard.noReportsDesc')}
          </p>
          <button
            onClick={() => navigate('/patient/upload-report')}
            className="bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600
                       text-white font-semibold px-6 py-2.5 rounded-xl transition-all shadow-md hover:shadow-lg"
          >
            {t('dashboard.uploadFirst')}
          </button>
        </div>
      )}
    </div>
  );
}
