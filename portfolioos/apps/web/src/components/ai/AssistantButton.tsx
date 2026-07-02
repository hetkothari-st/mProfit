import { useState } from 'react';
import { UserRound } from 'lucide-react';
import { AIAssistant } from './AIAssistant';

/**
 * Floating action button. Bottom-right on desktop, above the mobile
 * tab bar. Clicking opens the assistant drawer.
 */
export function AssistantButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 md:bottom-6 right-6 z-30 h-12 w-12 rounded-full bg-accent text-accent-foreground shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center group"
        aria-label="Open AI Assistant"
        title="Ask the AI Assistant"
      >
        <UserRound className="h-5 w-5 group-hover:scale-110 transition-transform" strokeWidth={1.9} />
      </button>
      <AIAssistant open={open} onClose={() => setOpen(false)} />
    </>
  );
}
