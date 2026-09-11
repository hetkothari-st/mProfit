/**
 * Indian credit cards and how each one looks, so a card tile can be drawn as
 * the real card: colourway, finish (brushed metal, matte, glossy, pearl),
 * background pattern, ink colour, orientation, and the network it usually
 * ships on.
 *
 * These are renditions in code of each card's published design — close to the
 * real card, not a copy of the issuer's artwork. Colours are approximate. Where
 * the issuer's own face image is on file (data/cardArt.generated, fetched by
 * scripts/fetch-card-art.py) that image is shown instead, and the rendition
 * here is its fallback. Cards not listed here are still drawn in their
 * tier's finish ("Platinum", "Signature", "Metal"…) in the issuer's brand
 * colours — see lib/creditCardDesign.
 *
 * `issuer` must be a bank name from data/indianBanks (so the bank's logo and
 * colours resolve) or one of the card-only issuers in CARD_ISSUERS below.
 */

export type CardNetwork = 'VISA' | 'MASTERCARD' | 'AMEX' | 'RUPAY' | 'DINERS';
export type CardFinish = 'metal' | 'matte' | 'glossy' | 'pearl';
export type CardPattern =
  | 'none'
  | 'waves'
  | 'lines'
  | 'circles'
  | 'hex'
  | 'topo'
  | 'mountains'
  | 'dots'
  | 'shapes';
export type CardTier =
  | 'classic'
  | 'gold'
  | 'platinum'
  | 'titanium'
  | 'signature'
  | 'world'
  | 'infinite'
  | 'black'
  | 'metal';

export interface CardDesign {
  /** CSS background for the card face. */
  background: string;
  finish: CardFinish;
  pattern: CardPattern;
  /** Stroke colour for the pattern (usually a translucent white or black). */
  patternColor?: string;
  /** Print colour: light ink on dark cards, dark ink on light ones. */
  ink: 'light' | 'dark';
  /** Colour of the printed product name, when it isn't the ink colour. */
  accent?: string;
  chip: 'gold' | 'silver';
  orientation: 'horizontal' | 'vertical';
}

export interface CatalogCard {
  id: string;
  issuer: string;
  product: string;
  /** Other ways people write the product name. */
  aliases?: string[];
  tier: CardTier;
  network: CardNetwork;
  design: CardDesign;
}

/** Card issuers that aren't banks in the bank list, with how they're written. */
export const CARD_ISSUERS: Array<{ name: string; aliases: string[]; color: string }> = [
  { name: 'American Express', aliases: ['amex', 'american express'], color: '#006fcf' },
];

const lg = (deg: number, ...stops: string[]) => `linear-gradient(${deg}deg, ${stops.join(', ')})`;

type DesignInput = Partial<CardDesign> & Pick<CardDesign, 'background'>;
const d = (x: DesignInput): CardDesign => ({
  finish: 'glossy',
  pattern: 'none',
  ink: 'light',
  chip: 'gold',
  orientation: 'horizontal',
  ...x,
});

// Shared finishes.
const BLACK_METAL = lg(135, '#26262b', '#121215 55%', '#050506');
const SILVER_METAL = lg(135, '#f1f3f5', '#c9ced4 45%', '#9aa1a9');
const GOLD = lg(135, '#f3dc9a', '#d4b062 45%', '#a07c35');
const W = 'rgba(255,255,255,0.14)';
const K = 'rgba(0,0,0,0.12)';

export const CARD_CATALOG: CatalogCard[] = [
  // ── HDFC Bank ──────────────────────────────────────────────────────────────
  { id: 'hdfc-infinia', issuer: 'HDFC Bank', product: 'Infinia', aliases: ['infinia metal'], tier: 'infinite', network: 'VISA',
    design: d({ background: BLACK_METAL, finish: 'metal', pattern: 'lines', patternColor: 'rgba(255,255,255,0.05)', accent: '#d9b877' }) },
  { id: 'hdfc-diners-black-metal', issuer: 'HDFC Bank', product: 'Diners Club Black Metal', aliases: ['dcb metal', 'diners black metal'], tier: 'metal', network: 'DINERS',
    design: d({ background: BLACK_METAL, finish: 'metal', accent: '#c0c5cc' }) },
  { id: 'hdfc-diners-black', issuer: 'HDFC Bank', product: 'Diners Club Black', aliases: ['dcb', 'diners black'], tier: 'black', network: 'DINERS',
    design: d({ background: lg(135, '#1d1d22', '#0b0b0d'), finish: 'matte', pattern: 'lines', patternColor: 'rgba(255,255,255,0.06)', accent: '#b9bec6' }) },
  { id: 'hdfc-diners-privilege', issuer: 'HDFC Bank', product: 'Diners Club Privilege', aliases: ['diners privilege'], tier: 'signature', network: 'DINERS',
    design: d({ background: lg(135, '#5a1f2a', '#2b0c12'), finish: 'matte', accent: '#e3c28a' }) },
  { id: 'hdfc-regalia-gold', issuer: 'HDFC Bank', product: 'Regalia Gold', aliases: ['regalia gold'], tier: 'gold', network: 'VISA',
    design: d({ background: lg(135, '#e8d29b', '#c8a55f 50%', '#95733a'), finish: 'metal', pattern: 'waves', patternColor: 'rgba(90,60,20,0.14)', ink: 'dark', accent: '#3a2a12' }) },
  { id: 'hdfc-regalia', issuer: 'HDFC Bank', product: 'Regalia', tier: 'world', network: 'MASTERCARD',
    design: d({ background: lg(135, '#1c2540', '#0c1224'), finish: 'matte', pattern: 'waves', patternColor: W, accent: '#d8c08b' }) },
  { id: 'hdfc-millennia', issuer: 'HDFC Bank', product: 'Millennia', tier: 'platinum', network: 'MASTERCARD',
    design: d({ background: lg(135, '#3b2f95', '#6a2ca8 55%', '#c2358f'), pattern: 'shapes', patternColor: 'rgba(255,255,255,0.16)' }) },
  { id: 'hdfc-moneyback-plus', issuer: 'HDFC Bank', product: 'MoneyBack+', aliases: ['moneyback plus', 'moneyback'], tier: 'classic', network: 'VISA',
    design: d({ background: lg(135, '#0a78b5', '#07507c'), pattern: 'circles', patternColor: W }) },
  { id: 'hdfc-freedom', issuer: 'HDFC Bank', product: 'Freedom', tier: 'classic', network: 'VISA',
    design: d({ background: lg(135, '#f07a24', '#c9420f'), pattern: 'circles', patternColor: W }) },
  { id: 'hdfc-swiggy', issuer: 'HDFC Bank', product: 'Swiggy', aliases: ['swiggy hdfc'], tier: 'platinum', network: 'MASTERCARD',
    design: d({ background: lg(160, '#ff9a3c', '#fc6d14 55%', '#e4570b'), pattern: 'shapes', patternColor: 'rgba(255,255,255,0.18)', orientation: 'vertical' }) },
  { id: 'hdfc-tata-neu-infinity', issuer: 'HDFC Bank', product: 'Tata Neu Infinity', aliases: ['neu infinity'], tier: 'infinite', network: 'RUPAY',
    design: d({ background: lg(160, '#2a1147', '#5b1f8f 55%', '#8f3fd1'), finish: 'pearl', pattern: 'circles', patternColor: W, orientation: 'vertical' }) },
  { id: 'hdfc-tata-neu-plus', issuer: 'HDFC Bank', product: 'Tata Neu Plus', aliases: ['neu plus'], tier: 'platinum', network: 'RUPAY',
    design: d({ background: lg(160, '#6b3fc4', '#9b6bea'), finish: 'pearl', pattern: 'circles', patternColor: W, orientation: 'vertical' }) },
  { id: 'hdfc-indianoil', issuer: 'HDFC Bank', product: 'IndianOil', aliases: ['indian oil', 'iocl'], tier: 'classic', network: 'RUPAY',
    design: d({ background: lg(135, '#f37021', '#1b3d8f'), pattern: 'waves', patternColor: W }) },
  { id: 'hdfc-marriott-bonvoy', issuer: 'HDFC Bank', product: 'Marriott Bonvoy', aliases: ['marriott'], tier: 'world', network: 'DINERS',
    design: d({ background: lg(135, '#2f2a26', '#4a3a2c 55%', '#1a1512'), finish: 'matte', accent: '#e4b77a' }) },
  { id: 'hdfc-pixel-play', issuer: 'HDFC Bank', product: 'Pixel Play', aliases: ['pixel'], tier: 'classic', network: 'RUPAY',
    design: d({ background: lg(135, '#101418', '#1d2a38'), finish: 'matte', pattern: 'dots', patternColor: 'rgba(120,200,255,0.25)' }) },
  { id: 'hdfc-shoppers-stop', issuer: 'HDFC Bank', product: 'Shoppers Stop', tier: 'classic', network: 'VISA',
    design: d({ background: lg(135, '#111111', '#2a2a2a'), finish: 'matte', accent: '#f4c20d' }) },

  // ── Axis Bank ──────────────────────────────────────────────────────────────
  { id: 'axis-reserve', issuer: 'Axis Bank', product: 'Reserve', aliases: ['axis reserve'], tier: 'metal', network: 'VISA',
    design: d({ background: BLACK_METAL, finish: 'metal', accent: '#d4b06a' }) },
  { id: 'axis-magnus-burgundy', issuer: 'Axis Bank', product: 'Magnus Burgundy', aliases: ['burgundy'], tier: 'metal', network: 'MASTERCARD',
    design: d({ background: lg(135, '#4a0d1e', '#2a0611 55%', '#150308'), finish: 'metal', accent: '#e0b98a' }) },
  { id: 'axis-magnus', issuer: 'Axis Bank', product: 'Magnus', tier: 'world', network: 'VISA',
    design: d({ background: lg(135, '#8a1538', '#5c0c25 55%', '#35061a'), finish: 'metal', pattern: 'lines', patternColor: 'rgba(255,255,255,0.05)' }) },
  { id: 'axis-atlas', issuer: 'Axis Bank', product: 'Atlas', tier: 'signature', network: 'VISA',
    design: d({ background: lg(135, '#0f4050', '#0a2733 55%', '#06161d'), finish: 'matte', pattern: 'mountains', patternColor: 'rgba(120,200,210,0.22)' }) },
  { id: 'axis-select', issuer: 'Axis Bank', product: 'Select', tier: 'signature', network: 'VISA',
    design: d({ background: lg(135, '#2b2f36', '#15181d'), finish: 'metal', pattern: 'lines', patternColor: 'rgba(255,255,255,0.05)', accent: '#c7a26b' }) },
  { id: 'axis-ace', issuer: 'Axis Bank', product: 'ACE', aliases: ['ace'], tier: 'platinum', network: 'VISA',
    design: d({ background: lg(135, '#1f1f24', '#0d0d10'), finish: 'matte', pattern: 'shapes', patternColor: 'rgba(0,200,180,0.22)', accent: '#2fd3bb' }) },
  { id: 'axis-flipkart', issuer: 'Axis Bank', product: 'Flipkart', aliases: ['flipkart axis'], tier: 'platinum', network: 'VISA',
    design: d({ background: lg(135, '#2874f0', '#1a52b8'), pattern: 'shapes', patternColor: 'rgba(255,224,0,0.28)', accent: '#ffe11b' }) },
  { id: 'axis-airtel', issuer: 'Axis Bank', product: 'Airtel', aliases: ['airtel axis'], tier: 'platinum', network: 'MASTERCARD',
    design: d({ background: lg(135, '#e40000', '#8d0000'), pattern: 'waves', patternColor: W }) },
  { id: 'axis-neo', issuer: 'Axis Bank', product: 'Neo', tier: 'classic', network: 'RUPAY',
    design: d({ background: lg(135, '#141414', '#2b1a3a'), finish: 'matte', pattern: 'shapes', patternColor: 'rgba(255,90,160,0.22)' }) },
  { id: 'axis-privilege', issuer: 'Axis Bank', product: 'Privilege', tier: 'signature', network: 'VISA',
    design: d({ background: lg(135, '#3a1c2a', '#1c0d15'), finish: 'matte', accent: '#d8b48a' }) },
  { id: 'axis-myzone', issuer: 'Axis Bank', product: 'MY Zone', aliases: ['myzone'], tier: 'classic', network: 'VISA',
    design: d({ background: lg(135, '#5b2c83', '#8c2a6e'), pattern: 'dots', patternColor: W }) },
  { id: 'axis-horizon', issuer: 'Axis Bank', product: 'Horizon', tier: 'signature', network: 'VISA',
    design: d({ background: lg(135, '#113c63', '#0a2240'), finish: 'matte', pattern: 'topo', patternColor: W }) },
  { id: 'axis-samsung', issuer: 'Axis Bank', product: 'Samsung Infinite', aliases: ['samsung'], tier: 'infinite', network: 'VISA',
    design: d({ background: lg(135, '#0b1a3a', '#050b1a'), finish: 'metal', accent: '#8fb2ff' }) },

  // ── SBI Card ───────────────────────────────────────────────────────────────
  { id: 'sbi-aurum', issuer: 'State Bank of India', product: 'Aurum', tier: 'metal', network: 'VISA',
    design: d({ background: lg(135, '#2a2418', '#141109'), finish: 'metal', accent: '#d7b46a' }) },
  { id: 'sbi-elite', issuer: 'State Bank of India', product: 'Elite', aliases: ['sbi card elite'], tier: 'signature', network: 'VISA',
    design: d({ background: lg(135, '#1c1c1c', '#050505'), finish: 'matte', pattern: 'lines', patternColor: 'rgba(212,176,106,0.14)', accent: '#d4b06a' }) },
  { id: 'sbi-miles-elite', issuer: 'State Bank of India', product: 'Miles Elite', aliases: ['miles'], tier: 'signature', network: 'VISA',
    design: d({ background: lg(135, '#0e2d4a', '#07182a'), finish: 'matte', pattern: 'topo', patternColor: W }) },
  { id: 'sbi-prime', issuer: 'State Bank of India', product: 'Prime', aliases: ['sbi card prime'], tier: 'signature', network: 'VISA',
    design: d({ background: lg(135, '#0f2a57', '#0a1a38'), pattern: 'waves', patternColor: W, accent: '#9ec2ff' }) },
  { id: 'sbi-cashback', issuer: 'State Bank of India', product: 'Cashback', aliases: ['cashback sbi', 'sbi cashback'], tier: 'platinum', network: 'VISA',
    design: d({ background: lg(135, '#2e1a6e', '#5a2aa8 55%', '#1d0f4a'), pattern: 'circles', patternColor: W }) },
  { id: 'sbi-simplyclick', issuer: 'State Bank of India', product: 'SimplyCLICK', aliases: ['simply click', 'simplyclick'], tier: 'classic', network: 'VISA',
    design: d({ background: lg(135, '#00a5b5', '#006f85'), pattern: 'dots', patternColor: W }) },
  { id: 'sbi-simplysave', issuer: 'State Bank of India', product: 'SimplySAVE', aliases: ['simply save', 'simplysave'], tier: 'classic', network: 'VISA',
    design: d({ background: lg(135, '#f28c28', '#c9571a'), pattern: 'dots', patternColor: W }) },
  { id: 'sbi-bpcl-octane', issuer: 'State Bank of India', product: 'BPCL Octane', aliases: ['octane'], tier: 'signature', network: 'VISA',
    design: d({ background: lg(135, '#111827', '#0b3b2e'), finish: 'matte', pattern: 'lines', patternColor: 'rgba(255,214,0,0.12)', accent: '#ffd600' }) },
  { id: 'sbi-bpcl', issuer: 'State Bank of India', product: 'BPCL', tier: 'classic', network: 'RUPAY',
    design: d({ background: lg(135, '#008c45', '#006233'), pattern: 'waves', patternColor: 'rgba(255,214,0,0.2)', accent: '#ffd600' }) },
  { id: 'sbi-irctc', issuer: 'State Bank of India', product: 'IRCTC', aliases: ['irctc sbi'], tier: 'platinum', network: 'RUPAY',
    design: d({ background: lg(135, '#1d4f91', '#0f2f5c'), pattern: 'lines', patternColor: W }) },
  { id: 'sbi-pulse', issuer: 'State Bank of India', product: 'PULSE', aliases: ['pulse'], tier: 'signature', network: 'VISA',
    design: d({ background: lg(135, '#1a1a1a', '#3a0d12'), finish: 'matte', pattern: 'waves', patternColor: 'rgba(255,60,60,0.18)' }) },
  { id: 'sbi-paytm', issuer: 'State Bank of India', product: 'Paytm SBI Card SELECT', aliases: ['paytm select', 'paytm'], tier: 'signature', network: 'VISA',
    design: d({ background: lg(135, '#00baf2', '#002e6e'), pattern: 'shapes', patternColor: W }) },

  // ── ICICI Bank ─────────────────────────────────────────────────────────────
  { id: 'icici-emeralde-private', issuer: 'ICICI Bank', product: 'Emeralde Private Metal', aliases: ['emeralde private'], tier: 'metal', network: 'VISA',
    design: d({ background: lg(135, '#0f3d2e', '#08221a 55%', '#030d09'), finish: 'metal', accent: '#d5b775' }) },
  { id: 'icici-emeralde', issuer: 'ICICI Bank', product: 'Emeralde', tier: 'infinite', network: 'MASTERCARD',
    design: d({ background: lg(135, '#0e6b4f', '#094a37'), finish: 'metal', pattern: 'hex', patternColor: W }) },
  { id: 'icici-sapphiro', issuer: 'ICICI Bank', product: 'Sapphiro', tier: 'signature', network: 'VISA',
    design: d({ background: lg(135, '#1b3f8f', '#0e2358'), finish: 'pearl', pattern: 'hex', patternColor: W }) },
  { id: 'icici-rubyx', issuer: 'ICICI Bank', product: 'Rubyx', tier: 'platinum', network: 'MASTERCARD',
    design: d({ background: lg(135, '#a3163a', '#650c23'), finish: 'pearl', pattern: 'hex', patternColor: W }) },
  { id: 'icici-coral', issuer: 'ICICI Bank', product: 'Coral', tier: 'classic', network: 'VISA',
    design: d({ background: lg(135, '#ff7a5c', '#e04a3a'), pattern: 'hex', patternColor: W }) },
  { id: 'icici-amazon-pay', issuer: 'ICICI Bank', product: 'Amazon Pay', aliases: ['amazon pay icici', 'amazon'], tier: 'platinum', network: 'VISA',
    design: d({ background: lg(135, '#232f3e', '#131a22'), finish: 'matte', pattern: 'waves', patternColor: 'rgba(255,153,0,0.18)', accent: '#ff9900' }) },
  { id: 'icici-makemytrip', issuer: 'ICICI Bank', product: 'MakeMyTrip Signature', aliases: ['makemytrip', 'mmt'], tier: 'signature', network: 'VISA',
    design: d({ background: lg(135, '#e2231a', '#0a2a6a'), pattern: 'shapes', patternColor: W }) },
  { id: 'icici-hpcl', issuer: 'ICICI Bank', product: 'HPCL Super Saver', aliases: ['hpcl'], tier: 'classic', network: 'VISA',
    design: d({ background: lg(135, '#1a3c8c', '#c8102e'), pattern: 'waves', patternColor: W }) },
  { id: 'icici-times-black', issuer: 'ICICI Bank', product: 'Times Black', aliases: ['times black'], tier: 'metal', network: 'VISA',
    design: d({ background: BLACK_METAL, finish: 'metal', accent: '#c9ced6' }) },

  // ── American Express ───────────────────────────────────────────────────────
  { id: 'amex-platinum', issuer: 'American Express', product: 'Platinum Card', aliases: ['platinum', 'platinum charge', 'the platinum card'], tier: 'metal', network: 'AMEX',
    design: d({ background: SILVER_METAL, finish: 'metal', pattern: 'lines', patternColor: K, ink: 'dark', chip: 'silver' }) },
  { id: 'amex-platinum-reserve', issuer: 'American Express', product: 'Platinum Reserve', aliases: ['plat reserve'], tier: 'platinum', network: 'AMEX',
    design: d({ background: lg(135, '#d9dde2', '#a8b0b9'), finish: 'metal', ink: 'dark', chip: 'silver' }) },
  { id: 'amex-platinum-travel', issuer: 'American Express', product: 'Platinum Travel', aliases: ['plat travel'], tier: 'platinum', network: 'AMEX',
    design: d({ background: lg(135, '#dfe7ee', '#aebfcf'), finish: 'pearl', pattern: 'topo', patternColor: K, ink: 'dark', chip: 'silver' }) },
  { id: 'amex-gold', issuer: 'American Express', product: 'Gold Card', aliases: ['gold', 'gold charge', 'amex gold'], tier: 'gold', network: 'AMEX',
    design: d({ background: GOLD, finish: 'metal', pattern: 'lines', patternColor: 'rgba(80,55,15,0.12)', ink: 'dark' }) },
  { id: 'amex-mrcc', issuer: 'American Express', product: 'Membership Rewards', aliases: ['mrcc', 'membership rewards credit card'], tier: 'classic', network: 'AMEX',
    design: d({ background: lg(135, '#cfe3e0', '#9cc3bd'), finish: 'pearl', ink: 'dark', chip: 'silver' }) },
  { id: 'amex-smartearn', issuer: 'American Express', product: 'SmartEarn', aliases: ['smart earn'], tier: 'classic', network: 'AMEX',
    design: d({ background: lg(135, '#2f7fd6', '#1558a6'), pattern: 'waves', patternColor: W }) },

  // ── Kotak Mahindra Bank ────────────────────────────────────────────────────
  { id: 'kotak-white-reserve', issuer: 'Kotak Mahindra Bank', product: 'White Reserve', aliases: ['white reserve'], tier: 'metal', network: 'VISA',
    design: d({ background: lg(135, '#f7f7f5', '#dcdcd8'), finish: 'metal', ink: 'dark', chip: 'silver' }) },
  { id: 'kotak-zen', issuer: 'Kotak Mahindra Bank', product: 'Zen Signature', aliases: ['zen'], tier: 'signature', network: 'VISA',
    design: d({ background: lg(135, '#0b2a4a', '#05162a'), finish: 'matte', pattern: 'circles', patternColor: W }) },
  { id: 'kotak-royale', issuer: 'Kotak Mahindra Bank', product: 'Royale Signature', aliases: ['royale'], tier: 'signature', network: 'VISA',
    design: d({ background: lg(135, '#4b0f1d', '#26060e'), finish: 'matte', accent: '#e0bd86' }) },
  { id: 'kotak-league', issuer: 'Kotak Mahindra Bank', product: 'League Platinum', aliases: ['league'], tier: 'platinum', network: 'VISA',
    design: d({ background: lg(135, '#e31b23', '#8f0f16'), pattern: 'lines', patternColor: W }) },
  { id: 'kotak-myntra', issuer: 'Kotak Mahindra Bank', product: 'Myntra', aliases: ['myntra kotak'], tier: 'platinum', network: 'MASTERCARD',
    design: d({ background: lg(135, '#ff3f6c', '#f7a21b'), pattern: 'shapes', patternColor: W }) },
  { id: 'kotak-811', issuer: 'Kotak Mahindra Bank', product: '811 Dream Different', aliases: ['811', 'dream different'], tier: 'classic', network: 'VISA',
    design: d({ background: lg(135, '#101820', '#1c3144'), finish: 'matte', pattern: 'dots', patternColor: 'rgba(237,28,36,0.25)' }) },
  { id: 'kotak-indigo', issuer: 'Kotak Mahindra Bank', product: 'IndiGo', aliases: ['6e rewards', 'indigo'], tier: 'platinum', network: 'MASTERCARD',
    design: d({ background: lg(135, '#001b94', '#000f55'), pattern: 'lines', patternColor: W }) },

  // ── IDFC FIRST Bank ────────────────────────────────────────────────────────
  { id: 'idfc-first-private', issuer: 'IDFC FIRST Bank', product: 'FIRST Private', aliases: ['first private', 'private'], tier: 'metal', network: 'VISA',
    design: d({ background: BLACK_METAL, finish: 'metal', accent: '#c9a35d' }) },
  { id: 'idfc-ashva', issuer: 'IDFC FIRST Bank', product: 'Ashva', tier: 'metal', network: 'MASTERCARD',
    design: d({ background: lg(135, '#4a3a2a', '#221a12'), finish: 'metal', accent: '#e2c08c' }) },
  { id: 'idfc-mayura', issuer: 'IDFC FIRST Bank', product: 'Mayura', tier: 'metal', network: 'MASTERCARD',
    design: d({ background: lg(135, '#0f3b3b', '#062020'), finish: 'metal', accent: '#6fd3c7' }) },
  { id: 'idfc-wealth', issuer: 'IDFC FIRST Bank', product: 'Wealth', tier: 'infinite', network: 'VISA',
    design: d({ background: lg(135, '#3a3d42', '#1c1e21'), finish: 'metal', pattern: 'lines', patternColor: 'rgba(255,255,255,0.05)' }) },
  { id: 'idfc-select', issuer: 'IDFC FIRST Bank', product: 'Select', tier: 'signature', network: 'VISA',
    design: d({ background: lg(135, '#7a1a26', '#4a0f17'), finish: 'matte' }) },
  { id: 'idfc-millennia', issuer: 'IDFC FIRST Bank', product: 'Millennia', tier: 'platinum', network: 'VISA',
    design: d({ background: lg(135, '#9d1d27', '#5e1117'), pattern: 'shapes', patternColor: W }) },
  { id: 'idfc-classic', issuer: 'IDFC FIRST Bank', product: 'Classic', tier: 'classic', network: 'VISA',
    design: d({ background: lg(135, '#b0202e', '#7a1520'), pattern: 'waves', patternColor: W }) },
  { id: 'idfc-wow', issuer: 'IDFC FIRST Bank', product: 'WOW!', aliases: ['wow'], tier: 'classic', network: 'VISA',
    design: d({ background: lg(135, '#ff5a5f', '#9d1d27'), pattern: 'dots', patternColor: W }) },

  // ── AU Small Finance Bank ──────────────────────────────────────────────────
  { id: 'au-zenith-plus', issuer: 'AU Small Finance Bank', product: 'Zenith+', aliases: ['zenith plus'], tier: 'metal', network: 'VISA',
    design: d({ background: BLACK_METAL, finish: 'metal', accent: '#f08a3c' }) },
  { id: 'au-zenith', issuer: 'AU Small Finance Bank', product: 'Zenith', tier: 'infinite', network: 'VISA',
    design: d({ background: lg(135, '#1c1c1c', '#3a1e0a'), finish: 'matte', accent: '#f08a3c' }) },
  { id: 'au-vetta', issuer: 'AU Small Finance Bank', product: 'Vetta', tier: 'signature', network: 'VISA',
    design: d({ background: lg(135, '#6d276d', '#3e1540'), pattern: 'waves', patternColor: W }) },
  { id: 'au-altura-plus', issuer: 'AU Small Finance Bank', product: 'Altura Plus', tier: 'platinum', network: 'VISA',
    design: d({ background: lg(135, '#eb691f', '#a8410c'), pattern: 'waves', patternColor: W }) },
  { id: 'au-lit', issuer: 'AU Small Finance Bank', product: 'LIT', aliases: ['lit'], tier: 'classic', network: 'VISA',
    design: d({ background: lg(135, '#ff7a18', '#af002d 60%', '#319197'), pattern: 'shapes', patternColor: W }) },

  // ── Yes Bank ───────────────────────────────────────────────────────────────
  { id: 'yes-marquee', issuer: 'Yes Bank', product: 'Marquee', tier: 'infinite', network: 'VISA',
    design: d({ background: BLACK_METAL, finish: 'metal', accent: '#8fb0ff' }) },
  { id: 'yes-reserv', issuer: 'Yes Bank', product: 'Reserv', tier: 'signature', network: 'MASTERCARD',
    design: d({ background: lg(135, '#0e2c5c', '#071733'), finish: 'matte', accent: '#e8c27a' }) },
  { id: 'yes-elite-plus', issuer: 'Yes Bank', product: 'Elite+', aliases: ['elite plus'], tier: 'world', network: 'MASTERCARD',
    design: d({ background: lg(135, '#1d4ea3', '#0e2c66'), pattern: 'lines', patternColor: W }) },
  { id: 'yes-select', issuer: 'Yes Bank', product: 'Select', tier: 'platinum', network: 'RUPAY',
    design: d({ background: lg(135, '#0060aa', '#e41e3f'), pattern: 'waves', patternColor: W }) },

  // ── IndusInd Bank ──────────────────────────────────────────────────────────
  { id: 'indusind-pinnacle', issuer: 'IndusInd Bank', product: 'Pinnacle', tier: 'world', network: 'MASTERCARD',
    design: d({ background: lg(135, '#2d2d33', '#111114'), finish: 'metal', accent: '#d3b27a' }) },
  { id: 'indusind-legend', issuer: 'IndusInd Bank', product: 'Legend', tier: 'signature', network: 'VISA',
    design: d({ background: lg(135, '#1a1a1d', '#000000'), finish: 'matte', pattern: 'lines', patternColor: 'rgba(211,178,122,0.12)', accent: '#d3b27a' }) },
  { id: 'indusind-tiger', issuer: 'IndusInd Bank', product: 'Tiger', tier: 'platinum', network: 'VISA',
    design: d({ background: lg(135, '#f28a1d', '#8c3b0d'), pattern: 'lines', patternColor: 'rgba(0,0,0,0.18)' }) },
  { id: 'indusind-eazydiner', issuer: 'IndusInd Bank', product: 'EazyDiner', aliases: ['eazy diner'], tier: 'platinum', network: 'MASTERCARD',
    design: d({ background: lg(135, '#e4212c', '#8f0f16'), pattern: 'dots', patternColor: W }) },
  { id: 'indusind-celesta', issuer: 'IndusInd Bank', product: 'Celesta', tier: 'infinite', network: 'VISA',
    design: d({ background: lg(135, '#2a1840', '#120a1d'), finish: 'metal', accent: '#c9a8ff' }) },

  // ── RBL Bank ───────────────────────────────────────────────────────────────
  { id: 'rbl-world-safari', issuer: 'RBL Bank', product: 'World Safari', aliases: ['safari'], tier: 'world', network: 'MASTERCARD',
    design: d({ background: lg(135, '#0f2f4f', '#07182a'), finish: 'matte', pattern: 'topo', patternColor: W }) },
  { id: 'rbl-shoprite', issuer: 'RBL Bank', product: 'ShopRite', aliases: ['shoprite'], tier: 'classic', network: 'MASTERCARD',
    design: d({ background: lg(135, '#e02b3f', '#8c1224'), pattern: 'dots', patternColor: W }) },
  { id: 'rbl-icon', issuer: 'RBL Bank', product: 'Icon', tier: 'world', network: 'MASTERCARD',
    design: d({ background: lg(135, '#1c1c24', '#0a0a10'), finish: 'metal', accent: '#e0c38a' }) },

  // ── Standard Chartered ─────────────────────────────────────────────────────
  { id: 'sc-ultimate', issuer: 'Standard Chartered Bank', product: 'Ultimate', tier: 'world', network: 'MASTERCARD',
    design: d({ background: lg(135, '#1e2227', '#0a0c0e'), finish: 'metal', pattern: 'lines', patternColor: 'rgba(255,255,255,0.05)' }) },
  { id: 'sc-smart', issuer: 'Standard Chartered Bank', product: 'Smart', tier: 'platinum', network: 'VISA',
    design: d({ background: lg(135, '#0473ea', '#38d200'), pattern: 'shapes', patternColor: W }) },
  { id: 'sc-easemytrip', issuer: 'Standard Chartered Bank', product: 'EaseMyTrip', aliases: ['easemytrip', 'emt'], tier: 'platinum', network: 'VISA',
    design: d({ background: lg(135, '#2a6de0', '#0b3a8f'), pattern: 'topo', patternColor: W }) },

  // ── HSBC ───────────────────────────────────────────────────────────────────
  { id: 'hsbc-premier', issuer: 'HSBC', product: 'Premier', tier: 'metal', network: 'MASTERCARD',
    design: d({ background: BLACK_METAL, finish: 'metal', accent: '#db0011' }) },
  { id: 'hsbc-travelone', issuer: 'HSBC', product: 'TravelOne', aliases: ['travel one'], tier: 'world', network: 'MASTERCARD',
    design: d({ background: lg(135, '#1d2733', '#0c1117'), finish: 'matte', pattern: 'topo', patternColor: W, accent: '#db0011' }) },
  { id: 'hsbc-live-plus', issuer: 'HSBC', product: 'Live+', aliases: ['live plus', 'cashback'], tier: 'platinum', network: 'VISA',
    design: d({ background: lg(135, '#db0011', '#8a000b'), pattern: 'shapes', patternColor: W }) },

  // ── Federal Bank ───────────────────────────────────────────────────────────
  { id: 'federal-scapia', issuer: 'Federal Bank', product: 'Scapia', tier: 'signature', network: 'VISA',
    design: d({ background: lg(160, '#0d3b2e', '#1f6b4f 55%', '#f2b84b'), finish: 'matte', pattern: 'mountains', patternColor: 'rgba(255,255,255,0.18)', orientation: 'vertical' }) },
  { id: 'federal-celesta', issuer: 'Federal Bank', product: 'Celesta', tier: 'infinite', network: 'VISA',
    design: d({ background: lg(135, '#0a2f5c', '#051a33'), finish: 'metal', accent: '#f2c14e' }) },
  { id: 'federal-signet', issuer: 'Federal Bank', product: 'Signet', tier: 'signature', network: 'VISA',
    design: d({ background: lg(135, '#0f4c8a', '#0a2f57'), pattern: 'lines', patternColor: W }) },

  // ── Bank of Baroda (BOBCARD) ───────────────────────────────────────────────
  { id: 'bob-onecard', issuer: 'Bank of Baroda', product: 'OneCard', aliases: ['one card', 'onecard metal'], tier: 'metal', network: 'VISA',
    design: d({ background: lg(160, '#2b2d31', '#0f1012'), finish: 'metal', pattern: 'lines', patternColor: 'rgba(255,255,255,0.05)', orientation: 'vertical' }) },
  { id: 'bob-eterna', issuer: 'Bank of Baroda', product: 'Eterna', tier: 'infinite', network: 'VISA',
    design: d({ background: lg(135, '#2a1308', '#120703'), finish: 'metal', accent: '#f08a3c' }) },
  { id: 'bob-premier', issuer: 'Bank of Baroda', product: 'Premier', tier: 'platinum', network: 'VISA',
    design: d({ background: lg(135, '#ea5e0f', '#a3400a'), pattern: 'waves', patternColor: W }) },
];
