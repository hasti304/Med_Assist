import { useTranslation } from 'react-i18next';

const STEPS = ['symptoms', 'diagnosis', 'tests', 'report'];

export default function AssistFlowStepper({ current = 'symptoms' }) {
  const { t } = useTranslation();
  const idx = STEPS.indexOf(current);

  return (
    <nav aria-label="Assist flow progress" className="flex items-center gap-1 sm:gap-2 flex-wrap">
      {STEPS.map((key, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={key} className="flex items-center gap-1 sm:gap-2">
            {i > 0 && <span className="text-slate-300 text-xs hidden sm:inline">›</span>}
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                active
                  ? 'bg-teal-600 text-white'
                  : done
                    ? 'bg-teal-50 text-teal-700'
                    : 'bg-slate-100 text-slate-400'
              }`}
            >
              {t(`assist.steps.${key}`)}
            </span>
          </div>
        );
      })}
    </nav>
  );
}
