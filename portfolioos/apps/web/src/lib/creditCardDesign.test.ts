import { describe, it, expect } from 'vitest';
import { CARD_ART } from '@/data/cardArt.generated';
import { CARD_CATALOG } from '@/data/creditCardCatalog';
import { cardProductsFor, resolveCardDesign, resolveCardIssuer } from './creditCardDesign';

describe('resolveCardIssuer', () => {
  it.each([
    ['HDFC', 'HDFC Bank'],
    ['hdfc bank ltd', 'HDFC Bank'],
    ['SBI Card', 'State Bank of India'],
    ['Amex', 'American Express'],
    ['American Express Banking Corp', 'American Express'],
    ['BOBCARD', 'Bank of Baroda'],
    ['OneCard', 'Bank of Baroda'],
  ])('%j → %s', (input, name) => {
    expect(resolveCardIssuer(input)).toBe(name);
  });

  it('keeps an unknown issuer as typed', () => {
    expect(resolveCardIssuer('Nowhere Co-op')).toBe('Nowhere Co-op');
  });
});

describe('resolveCardDesign', () => {
  it('finds an exact catalog card', () => {
    const r = resolveCardDesign({ issuerBank: 'HDFC Bank', cardName: 'Regalia Gold', network: null });
    expect(r.catalogId).toBe('hdfc-regalia-gold');
    expect(r.product).toBe('Regalia Gold');
    expect(r.network).toBe('VISA'); // the card's usual network when none is saved
  });

  it('prefers the longer product name ("Regalia Gold" over "Regalia")', () => {
    expect(resolveCardDesign({ issuerBank: 'HDFC', cardName: 'HDFC Regalia Gold Credit Card', network: null }).catalogId)
      .toBe('hdfc-regalia-gold');
    expect(resolveCardDesign({ issuerBank: 'HDFC', cardName: 'Regalia', network: null }).catalogId)
      .toBe('hdfc-regalia');
  });

  it('matches aliases and loose spelling', () => {
    expect(resolveCardDesign({ issuerBank: 'SBI Card', cardName: 'Simply Click', network: null }).catalogId)
      .toBe('sbi-simplyclick');
    expect(resolveCardDesign({ issuerBank: 'Amex', cardName: 'MRCC', network: null }).catalogId).toBe('amex-mrcc');
  });

  it("only matches the issuer's own cards", () => {
    // Magnus is an Axis card; typed under HDFC it must not borrow Axis's design.
    expect(resolveCardDesign({ issuerBank: 'HDFC Bank', cardName: 'Magnus', network: null }).catalogId).toBeNull();
    expect(resolveCardDesign({ issuerBank: 'Axis Bank', cardName: 'Magnus', network: null }).catalogId).toBe('axis-magnus');
  });

  it('keeps the network the user saved over the catalog default', () => {
    expect(resolveCardDesign({ issuerBank: 'HDFC Bank', cardName: 'Regalia Gold', network: 'MASTERCARD' }).network)
      .toBe('MASTERCARD');
  });

  it('draws an unlisted Platinum card in platinum metal', () => {
    const r = resolveCardDesign({ issuerBank: 'Canara Bank', cardName: 'Platinum', network: 'RUPAY' });
    expect(r.catalogId).toBeNull();
    expect(r.tier).toBe('platinum');
    expect(r.design.finish).toBe('metal');
    expect(r.design.ink).toBe('dark');
  });

  it('draws an unlisted Signature or Metal card dark', () => {
    expect(resolveCardDesign({ issuerBank: 'Union Bank of India', cardName: 'Signature', network: 'VISA' }).design.ink)
      .toBe('light');
    expect(resolveCardDesign({ issuerBank: 'Canara Bank', cardName: 'Metal Edition', network: 'VISA' }).design.finish)
      .toBe('metal');
  });

  it("falls back to the issuer's brand colours for anything else", () => {
    const r = resolveCardDesign({ issuerBank: 'Punjab National Bank', cardName: 'Rupay Select', network: 'RUPAY' });
    expect(r.catalogId).toBeNull();
    expect(r.design.background).toMatch(/linear-gradient/);
    expect(r.issuer).toBe('Punjab National Bank');
  });
});

describe('card art', () => {
  it("shows the issuer's face printed with the saved network", () => {
    expect(resolveCardDesign({ issuerBank: 'Federal Bank', cardName: 'Scapia', network: 'RUPAY' }).art?.src)
      .toBe('/cards/federal-scapia--rupay.webp');
    expect(resolveCardDesign({ issuerBank: 'Federal Bank', cardName: 'Scapia', network: 'VISA' }).art?.src)
      .toBe('/cards/federal-scapia--visa.webp');
  });

  it("uses the product's usual network when none is saved", () => {
    expect(resolveCardDesign({ issuerBank: 'Federal', cardName: 'Scapia', network: null }).art?.src)
      .toBe('/cards/federal-scapia--visa.webp');
  });

  it('never shows a face printed with another network', () => {
    expect(resolveCardDesign({ issuerBank: 'Federal Bank', cardName: 'Scapia', network: 'MASTERCARD' }).art).toBeNull();
  });

  it('has no art for cards without a face on file or outside the catalog', () => {
    expect(resolveCardDesign({ issuerBank: 'HDFC Bank', cardName: 'Regalia Gold', network: 'VISA' }).art).toBeNull();
    expect(resolveCardDesign({ issuerBank: 'Canara Bank', cardName: 'Platinum', network: 'RUPAY' }).art).toBeNull();
  });

  it('keys every face to a catalog card and a network it names', () => {
    const ids = new Set(CARD_CATALOG.map((c) => c.id));
    for (const [id, faces] of Object.entries(CARD_ART)) {
      expect(ids.has(id)).toBe(true);
      for (const [network, face] of Object.entries(faces)) {
        expect(face?.src).toBe(`/cards/${id}--${network.toLowerCase()}.webp`);
      }
    }
  });
});

describe('catalog', () => {
  it('has unique ids and one entry per issuer + product', () => {
    const ids = CARD_CATALOG.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const keys = CARD_CATALOG.map((c) => `${c.issuer}|${c.product.toLowerCase()}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every catalog issuer resolves to its logo and colours", () => {
    for (const card of CARD_CATALOG) expect(resolveCardIssuer(card.issuer)).toBe(card.issuer);
  });

  it('lists products for the form, filtered by issuer', () => {
    const hdfc = cardProductsFor('HDFC').map((c) => c.product);
    expect(hdfc).toContain('Infinia');
    expect(hdfc).not.toContain('Magnus');
    expect(cardProductsFor('').length).toBe(CARD_CATALOG.length);
  });
});
