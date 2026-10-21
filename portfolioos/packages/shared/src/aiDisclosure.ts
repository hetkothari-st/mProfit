/**
 * How the app uses AI in advice. SEBI's Investment Advisers Regulations
 * (Reg. 15(14), 18(9)) require an adviser using AI tools to tell clients the
 * extent of that use when they sign up and again whenever it changes, and
 * hold the adviser solely responsible for the result. Bump `version` whenever
 * the text changes so every client sees it again.
 *
 * Draft wording pending the practice's compliance review.
 */
export interface AiDisclosurePoint {
  heading: string;
  body: string;
}

export const AI_USE_DISCLOSURE = {
  version: '2026-10-21',
  title: 'How EveryPaisa uses AI in advice',
  summary: 'Answers are written by an AI model, under our SEBI-registered adviser’s responsibility.',
  points: [
    {
      heading: 'Where AI is used',
      body: 'The EveryPaisa Assistant writes every answer with an AI model (Anthropic’s Claude), and the Advisor page uses one to word its explanations. A person does not review each answer before you see it.',
    },
    {
      heading: 'What the AI does not decide',
      body: 'Figures such as returns, tax, goal projections and SIP amounts come from the app’s own calculators and your data, not from the model. Specific funds are named only from our approved list, chosen by our documented ranking method.',
    },
    {
      heading: 'What the AI sees',
      body: 'The portfolio, goal and profile data needed to answer your question is sent to Anthropic for processing. Your name and email are left out, and personal identifiers you type into the chat are masked first.',
    },
    {
      heading: 'Who is responsible',
      body: 'Our SEBI-registered investment adviser is solely responsible for advice given through these AI tools and for keeping your data secure, as SEBI’s rules require.',
    },
    {
      heading: 'Its limits',
      body: 'AI can misread a question or make a mistake. Check any figure that matters before you act on it, and ask us if something looks wrong.',
    },
    {
      heading: 'Records and changes',
      body: 'Each conversation is kept with the data and sources it used, so advice can be reviewed later. If we change how AI is used in advice, we will show you this notice again.',
    },
  ] satisfies AiDisclosurePoint[],
} as const;
