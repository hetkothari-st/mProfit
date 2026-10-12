import type { WillStepSlug } from '../willSteps';
import type { WillStepProps } from './types';
import { DetailsStep } from './DetailsStep';
import { PeopleStep } from './PeopleStep';
import { InstructionsStep } from './InstructionsStep';

/** Step components by URL slug. A slug with no entry sends the user back to the overview. */
export const WILL_STEP_COMPONENTS: Partial<Record<WillStepSlug, (p: WillStepProps) => JSX.Element>> = {
  details: DetailsStep,
  people: PeopleStep,
  instructions: InstructionsStep,
};
