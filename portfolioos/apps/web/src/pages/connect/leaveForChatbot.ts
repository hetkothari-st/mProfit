/** Hand the browser back to the chatbot (a full navigation to its callback). Own module so tests can mock it. */
export function leaveForChatbot(url: string): void {
  window.location.assign(url);
}
