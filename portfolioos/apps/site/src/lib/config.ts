const env = import.meta.env;

const trim = (v: string | undefined, fallback: string) => (v && v.trim() ? v.trim().replace(/\/$/, '') : fallback);

export const config = {
  siteUrl: trim(env.VITE_SITE_URL, 'https://everypaisa.in'),
  appUrl: trim(env.VITE_APP_URL, 'https://portfolio-os.up.railway.app'),
  contactEmail: trim(env.VITE_CONTACT_EMAIL, 'hello@everypaisa.in'),
  contactEndpoint: env.VITE_CONTACT_ENDPOINT?.trim() || '',
};

export const appLinks = {
  register: `${config.appUrl}/register`,
  login: `${config.appUrl}/login`,
  privacy: `${config.appUrl}/privacy`,
};
