import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { logger } from '../../../lib/logger.js';
import { readPdfText, getUserPdfPasswords, isPdfPasswordError } from '../../../lib/pdf.js';
import type { Parser, ParserResult, ParsedTransaction } from './types.js';

// Setup Gemini API client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

/**
 * PII Scrubbing Utility
 * Replaces PAN, Email, Mobile numbers, and parts of Folio numbers to preserve user privacy
 * before sending the raw text to the external LLM API.
 */
function scrubPII(text: string): string {
  let scrubbed = text;
  
  // Mask 10-digit PAN (e.g. ABCDE1234F -> A****1234F)
  scrubbed = scrubbed.replace(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/gi, 'A****0000Z');
  
  // Mask emails
  scrubbed = scrubbed.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, 'user@example.com');
  
  // Mask 10-digit mobile numbers
  scrubbed = scrubbed.replace(/\b[6-9]\d{9}\b/g, '9999999999');

  // Mask folios (keep first 2, last 2)
  scrubbed = scrubbed.replace(/Folio No[:\s]*([A-Z0-9/-]+)/gi, (match, folio) => {
    if (folio.length > 4) {
      const masked = folio.substring(0, 2) + '*'.repeat(folio.length - 4) + folio.substring(folio.length - 2);
      return `Folio No: ${masked}`;
    }
    return match;
  });

  return scrubbed;
}

// Define the structured schema for Gemini tool-calling
const transactionSchema: any = {
  type: SchemaType.ARRAY,
  description: "List of mutual fund transactions extracted from the statement.",
  items: {
    type: SchemaType.OBJECT,
    properties: {
      assetClass: {
        type: SchemaType.STRING,
        description: "Must always be 'MUTUAL_FUND'",
        nullable: false
      },
      transactionType: {
        type: SchemaType.STRING,
        description: "The type of transaction.",
        enum: ["BUY", "SELL", "SIP", "SWITCH_IN", "SWITCH_OUT", "DIVIDEND_REINVEST", "REDEMPTION", "REVERSAL", "OTHER"],
        nullable: false
      },
      schemeName: {
        type: SchemaType.STRING,
        description: "The name of the mutual fund scheme.",
        nullable: false
      },
      isin: {
        type: SchemaType.STRING,
        description: "The ISIN of the mutual fund, starting with 'INF' or 'INE'.",
        nullable: true
      },
      folioNumber: {
        type: SchemaType.STRING,
        description: "The folio number for the transaction.",
        nullable: true
      },
      tradeDate: {
        type: SchemaType.STRING,
        description: "The date of the transaction in YYYY-MM-DD format.",
        nullable: false
      },
      quantity: {
        type: SchemaType.STRING,
        description: "The number of units transacted. Always return a positive number regardless of transaction type.",
        nullable: false
      },
      price: {
        type: SchemaType.STRING,
        description: "The NAV (Net Asset Value) or price per unit. Always return a positive number.",
        nullable: false
      },
      narration: {
        type: SchemaType.STRING,
        description: "The transaction description or narration.",
        nullable: true
      }
    },
    required: ["assetClass", "transactionType", "schemeName", "tradeDate", "quantity", "price"]
  }
};

export const aiMfCasParser: Parser = {
  name: 'ai-mf-cas',

  async canHandle(ctx, sample) {
    if (!ctx.fileName.toLowerCase().endsWith('.pdf')) return false;
    const text = typeof sample === 'string' ? sample : '';
    if (!text) return false;
    const t = text.toUpperCase();
    
    // Check if it's a Mutual Fund CAS
    const isMfCas =
      t.includes('CAMS') ||
      t.includes('KFINTECH') ||
      t.includes('KARVY') ||
      (t.includes('CONSOLIDATED ACCOUNT STATEMENT') &&
        (t.includes('MUTUAL FUND') || t.includes('AMC')) &&
        !t.includes('NSDL') &&
        !t.includes('CDSL'));
    
    // Ensure API key is available
    if (isMfCas && !process.env.GEMINI_API_KEY) {
      logger.warn('[ai-mf-cas] Gemini API key not found. Skipping AI fallback.');
      return false;
    }

    return isMfCas;
  },

  async parse(ctx): Promise<ParserResult> {
    const passwords = await getUserPdfPasswords(ctx.userId);
    let text: string;
    try {
      const r = await readPdfText(ctx.filePath, passwords);
      text = r.text;
    } catch (err) {
      if (isPdfPasswordError(err)) {
        return {
          broker: 'AI CAMS/KFintech CAS',
          transactions: [],
          warnings: [
            passwords.length === 0
              ? 'CAS PDF is password-protected. Set your PAN in Settings — CAMS/KFintech CAS is encrypted with your PAN.'
              : 'CAS PDF is password-protected and your saved PAN did not unlock it. Some CAS files use PAN + DOB (DDMMYYYY); those are not yet supported — decrypt the PDF manually and re-upload.',
          ],
        };
      }
      throw err;
    }

    // 1. Scrub PII
    const scrubbedText = scrubPII(text);
    const warnings: string[] = [];

    // 2. Ask Gemini to extract
    try {
      logger.info({ fileName: ctx.fileName }, '[ai-mf-cas] Sending text to Gemini for extraction');
      
      const model = genAI.getGenerativeModel({ 
          model: 'gemini-flash-latest',
          generationConfig: {
              responseMimeType: "application/json",
              responseSchema: transactionSchema,
              temperature: 0.1
          }
      });

      const result = await model.generateContent(`Extract all mutual fund transactions from the following Consolidated Account Statement (CAS). 
        Return ONLY valid JSON matching the schema.
        Text:\n\n${scrubbedText.substring(0, 500000)}`);

      const output = result.response.text();
      
      if (!output) {
         throw new Error("Empty response from Gemini API");
      }

      // Parse JSON
      const parsedData: any[] = JSON.parse(output);
      
      // Map to ParsedTransaction
      const transactions: ParsedTransaction[] = parsedData.map(t => ({
          assetClass: t.assetClass || 'MUTUAL_FUND',
          transactionType: t.transactionType,
          schemeName: t.schemeName,
          isin: t.isin,
          folioNumber: t.folioNumber,
          assetName: t.schemeName || t.isin, // Generic mapping
          tradeDate: t.tradeDate,
          quantity: Math.abs(parseFloat(t.quantity || '0')).toString(),
          price: Math.abs(parseFloat(t.price || '0')).toString(),
          narration: t.narration
      }));

      if (transactions.length === 0) {
        logger.warn({ fileName: ctx.fileName }, '[ai-mf-cas] Gemini extracted 0 transactions');
        warnings.push('AI Parser could not detect any mutual fund transactions in this statement.');
      }

      return {
        broker: 'CAMS/KFintech CAS',
        adapter: 'cas.mf.ai',
        adapterVer: '1',
        transactions,
        warnings,
      };

    } catch (error: any) {
      logger.error({ error: error.message }, '[ai-mf-cas] Failed to extract via Gemini');
      warnings.push(`AI parsing failed: ${error.message}`);
      return {
          broker: 'CAMS/KFintech CAS',
          adapter: 'cas.mf.ai',
          adapterVer: '1',
          transactions: [],
          warnings
      };
    }
  },
};
