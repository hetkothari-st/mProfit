import type { AiSuggestion } from '@/api/aiAssistant.api';

/**
 * Horizontal row of tappable question pills. Shown before any messages
 * and after each assistant response so the next useful query is one
 * click away.
 */
export function SuggestedQuestions({
  questions,
  onSelect,
  disabled,
}: {
  questions: AiSuggestion[];
  onSelect: (q: string) => void;
  disabled?: boolean;
}) {
  if (questions.length === 0) return null;
  return (
    <div className="flex gap-2 flex-wrap">
      {questions.map((q) => (
        <button
          key={q.question}
          type="button"
          onClick={() => onSelect(q.question)}
          disabled={disabled}
          className={`text-xs px-3 py-1.5 rounded-full border border-border bg-card/40 hover:bg-accent/5 hover:border-accent/50 transition-colors ${
            disabled ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {q.question}
        </button>
      ))}
    </div>
  );
}
