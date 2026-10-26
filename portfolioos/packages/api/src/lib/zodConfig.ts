import { installZodV3Messages } from '@everypaisa/shared';

// Side-effect module, imported first by the server entry point: keeps zod 3's
// default validation wording that API 400 responses echo (see zodMessages.ts
// in @everypaisa/shared for why).
installZodV3Messages();
