import fs from 'fs';
import { playwrightSessionManager } from '../../lib/playwrightSessions.js';
import { logger } from '../../lib/logger.js';
import type { VehicleRecord } from './types.js';
import { fetchCarInfoRC, findVehicleObject, mapToVehicleRecord } from './carinfo.js';

const BASE_URL = 'https://www.carinfo.app/rc-details/';

export async function initiateCarInfoScrape(regNo: string, mobileNo: string): Promise<string> {
  const cleanRegNo = regNo.replace(/\s+/g, '').toUpperCase();
  const session = await playwrightSessionManager.createSession(cleanRegNo);
  const { page } = session;

  // Set up network interception. Capture both REQUEST headers and RESPONSE
  // bodies — request headers reveal CarInfo's auth/CSRF tokens for direct
  // API calls; response bodies hold the actual vehicle data after auth.
  (session as any).apiResponses = [];
  (session as any).apiRequests = [];
  page.on('request', (request) => {
    try {
      const url = request.url();
      if (/api|rc|vehicle|otp|verify|auth/i.test(url)) {
        (session as any).apiRequests.push({
          url,
          method: request.method(),
          headers: request.headers(),
          postData: request.postData(),
        });
      }
    } catch (e) { /* ignore */ }
  });
  page.on('response', async (response) => {
    try {
      const url = response.url();
      if (url.includes('api') || url.includes('rc') || url.includes('vehicle') || url.includes('search') || url.includes('otp') || url.includes('verify')) {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('application/json')) {
          const json = await response.json().catch(() => null);
          (session as any).apiResponses.push({ url, status: response.status(), json });
        }
      }
    } catch (e) {
      // ignore
    }
  });

  try {
    logger.info({ regNo: cleanRegNo, mobileNo }, '[carinfo-pw] Initiating scrape');
    await page.goto(`${BASE_URL}${cleanRegNo}`, { waitUntil: 'networkidle' });

    // Click "Login with OTP"
    const loginWithOtp = page.locator('text=/Login with OTP/i');
    await loginWithOtp.waitFor({ state: 'visible', timeout: 10000 });
    await loginWithOtp.click();

    // Enter mobile number - use the ID as verified in testing
    const mobileInput = page.locator('#mobileNumber');
    await mobileInput.waitFor({ state: 'visible', timeout: 5000 });
    await mobileInput.fill(mobileNo);

    // Click "Get OTP"
    const getOtpBtn = page.locator('button:has-text("Get OTP"), button:has-text("Send OTP"), button:has-text("Login")');
    await getOtpBtn.click();

    // Wait a bit for the OTP screen to transition
    await page.waitForTimeout(2000);

    return session.id;
  } catch (error) {
    await playwrightSessionManager.closeSession(session.id);
    logger.error({ error, regNo: cleanRegNo }, '[carinfo-pw] Failed to initiate scrape');
    throw error;
  }
}

export async function verifyCarInfoOtp(sessionId: string, otp: string): Promise<any> {
  const session = playwrightSessionManager.getSession(sessionId);
  if (!session) {
    throw new Error('Session expired or not found');
  }

  const { page, regNo } = session;

  try {
    logger.info({ regNo, sessionId }, '[carinfo-pw] Verifying OTP');
    
    // Fill OTP using real keyboard events — `fill()` skips React's onInput
    // event chain on some controlled-input components, leaving form state
    // empty. `pressSequentially()` simulates real key presses so React's
    // state hooks update normally.
    const otpInputs = page.locator('.login_otpContainer__zuj08 input, .otp-input input, input[maxlength="1"]');
    const inputCount = await otpInputs.count();

    if (inputCount > 1) {
        logger.info({ regNo, sessionId, inputCount }, '[carinfo-pw] Filling multi-input OTP');
        // Click first input to focus, then type each digit sequentially —
        // OTP boxes auto-advance focus on input.
        await otpInputs.first().click();
        for (let i = 0; i < otp.length; i++) {
            const ch = otp[i];
            if (!ch) continue;
            // Try directly typing into the i-th input; if focus auto-advances
            // it'll land in the next anyway. Use pressSequentially for proper events.
            try {
                await otpInputs.nth(i).pressSequentially(ch, { delay: 50 });
            } catch {
                // Fallback: use page-level keyboard if specific input failed.
                await page.keyboard.type(ch, { delay: 50 });
            }
        }
    } else {
        const otpInput = page.locator('input[id*="otp" i], input[placeholder*="OTP" i], input[type="number"], input[type="tel"], .otp-input');
        await otpInput.first().waitFor({ state: 'visible', timeout: 10000 });
        await otpInput.first().click();
        await otpInput.first().pressSequentially(otp, { delay: 50 });
    }
    // Brief pause so React state propagates before the submit click fires.
    await page.waitForTimeout(500);

    // Click verify and WAIT for the actual API call (not just the click event).
    // Try candidate buttons in priority order; if none triggers a verifyOtp
    // API hit within 5s, the button was wrong.
    const candidates = [
      'button:has-text("CONFIRM OTP")',
      'button:has-text("Verify OTP")',
      'button:has-text("Verify")',
      'button:has-text("Submit OTP")',
      'button:has-text("Submit")',
      'button:has-text("Continue")',
      'button[type="submit"]',
      'button:has-text("Login")',
    ];

    let verifyHit = false;
    for (const sel of candidates) {
        const btn = page.locator(sel).first();
        try {
            const visible = await btn.isVisible({ timeout: 1000 });
            if (!visible) continue;
        } catch { continue; }
        try {
            // Race a verifyOtp network response against a 6s timeout.
            const verifyResponsePromise = page.waitForResponse(
                (resp) => /verifyOtp|verify-otp|verifyOTP|userVerifyOtp/i.test(resp.url()),
                { timeout: 6000 },
            ).catch(() => null);
            await btn.click({ timeout: 2000 });
            const resp = await verifyResponsePromise;
            if (resp) {
                const status = resp.status();
                logger.info({ regNo, sessionId, button: sel, url: resp.url(), status }, '[carinfo-pw] verifyOtp API hit');
                if (status >= 400) {
                    let errBody = '';
                    try { errBody = await resp.text(); } catch {}
                    throw new Error(`CarInfo OTP rejected (HTTP ${status}): ${errBody.slice(0, 200)}`);
                }
                verifyHit = true;
                break;
            }
            logger.warn({ regNo, sessionId, button: sel }, '[carinfo-pw] click fired but no verifyOtp API response — trying next button');
        } catch (e) {
            logger.warn({ regNo, sessionId, button: sel, err: e instanceof Error ? e.message : String(e) }, '[carinfo-pw] button click failed');
        }
    }
    if (!verifyHit) {
        throw new Error('CarInfo verify button did not trigger verifyOtp API — UI may have changed.');
    }

    // Check for error messages immediately
    const errorMsg = page.locator('.login_errorMessage__HwHb9, [class*="errorMessage"]');
    if (await errorMsg.isVisible()) {
        const text = await errorMsg.innerText();
        if (text.toLowerCase().includes('incorrect') || text.toLowerCase().includes('invalid')) {
            throw new Error(`CarInfo OTP Error: ${text}`);
        }
    }

    // Wait for the modal to close or the page to transition
    try {
        await page.waitForSelector('.login_loginUiContainer__14OFb', { state: 'hidden', timeout: 15000 });
    } catch (e) {
        // If still visible, check for error again
        if (await errorMsg.isVisible()) {
            throw new Error(`CarInfo OTP Error: ${await errorMsg.innerText()}`);
        }
        logger.warn({ sessionId }, 'Login modal did not close, proceeding anyway...');
    }

    // CRITICAL: Modal close ≠ data unlocked. CarInfo's page was rendered
    // pre-auth (with masked owner name + empty accordions). The post-auth
    // data fetch only happens on a fresh page load with the new auth cookies.
    // Reload now so the page refetches with the authenticated session.
    logger.info({ regNo, sessionId }, '[carinfo-pw] reloading page post-OTP for authenticated data');
    try {
        await page.reload({ waitUntil: 'networkidle', timeout: 20000 });
    } catch (e) {
        logger.warn({ regNo, sessionId, err: e instanceof Error ? e.message : String(e) }, '[carinfo-pw] reload failed; trying goto fallback');
        try {
            await page.goto(`${BASE_URL}${regNo}`, { waitUntil: 'networkidle', timeout: 20000 });
        } catch (e2) {
            logger.warn({ regNo, sessionId, err: e2 instanceof Error ? e2.message : String(e2) }, '[carinfo-pw] goto reload also failed');
        }
    }
    // Settle: let post-auth data injection complete.
    await page.waitForTimeout(2500);

    // Detect CarInfo's daily-search rate-limit page so the user gets a
    // clear error instead of an empty Vehicle row.
    const bodyText = await page.evaluate('document.body ? document.body.innerText : ""');
    const bt = String(bodyText).toLowerCase();
    if (bt.includes('search limit has been exhausted') || bt.includes('multiple vehicles search detected') || bt.includes('download the carinfo app for free unlimited')) {
        await playwrightSessionManager.closeSession(sessionId);
        throw new Error(
            'CarInfo daily search limit exhausted on this network. Wait 24h and retry, or use the CarInfo Android app for unlimited searches.',
        );
    }

    // CLICK ALL EXPANDABLE SECTIONS to reveal hidden data. CarInfo's
    // accordion sections (Ownership Details, Important Dates, Other Info,
    // RTO Details) are collapsed by default and content is lazy-loaded.
    // Force-click every header, wait longer per click for network fetches.
    // NOTE: string-eval to prevent tsx __name injection in browser.
    await page.evaluate(`(async () => {
        var headers = document.querySelectorAll('[class*="expandHeader"]');
        for (var i = 0; i < headers.length; i++) {
            try {
                headers[i].click();
            } catch (e) { /* skip */ }
            await new Promise(function(r) { setTimeout(r, 1200); });
        }
    })()`);
    // Wait for any lazy-loaded section content to render (network + render).
    try {
      await page.waitForLoadState('networkidle', { timeout: 8000 });
    } catch { /* continue */ }
    await page.waitForTimeout(2000);
    
    // Wait for vehicle data sections to render (post-login content load).
    await page.waitForTimeout(2000);

    // Extract data from rendered DOM. Strategy (in priority):
    //   A. Class-pattern selectors — CarInfo uses CSS-modules with hashed
    //      suffixes (input_vehical_layout_*__hash). Match by partial class
    //      name to survive hash rotation across deploys.
    //   B. Exact-label search via leaf-text walking — robust against DOM
    //      restructure, but only works when label is in its own element.
    //   C. Full-text regex — last resort over page.innerText.
    // NOTE: string-eval to avoid tsx/__name injection breaking browser.
    const data = await page.evaluate(`(function() {
      var results = { _source: 'unknown', scraped: {} };

      var script = document.getElementById('__NEXT_DATA__');
      if (script) {
          try {
              var parsed = JSON.parse(script.innerText);
              results.nextData = (parsed && parsed.props && parsed.props.pageProps) ? parsed.props.pageProps : parsed;
              results._source = 'next_data';
          } catch (e) {}
      }

      var KNOWN_LABELS = [
        'Owner Name', 'Registered Owner', 'Make & Model', 'Maker', 'Manufacturer',
        'Make', 'Model', 'Vehicle Model', 'Variant', 'Manufacturing Year', 'Mfg Year',
        'Year', 'Fuel Type', 'Fuel', 'Color', 'Colour', 'Chassis Number', 'Chassis No',
        'Engine Number', 'Engine No', 'Insurance Expiry', 'Insurance Upto', 'Insurance',
        'PUC Expiry', 'PUC Upto', 'Pollution', 'Fitness Expiry', 'Fitness Upto', 'Fitness',
        'Road Tax', 'Tax Upto', 'Permit Upto', 'Registered RTO', 'RTO Office', 'RTO',
        'Registration Date', 'Reg Date', 'RC Status', 'Vehicle Class', 'Vehicle Type',
        'Emission Norms', 'Norms Type', 'Seating Capacity', 'Hypothecation', 'Financier',
      ].map(function(l) { return l.toLowerCase(); });

      function isKnownLabel(text) {
        var t = (text || '').trim().toLowerCase();
        for (var i = 0; i < KNOWN_LABELS.length; i++) {
          if (t === KNOWN_LABELS[i]) return true;
        }
        return false;
      }

      function isPlausibleValue(text) {
        var t = (text || '').trim();
        if (!t || t.length < 1 || t.length > 80) return false;
        if (t === '-' || t.toLowerCase() === 'n/a' || t.toLowerCase() === 'na') return false;
        if (isKnownLabel(t)) return false;
        return true;
      }

      // Find value paired with a label, using exact-match + parent-sibling walk.
      function findValue(labelParts) {
        var leafSelector = 'p, span, div, h1, h2, h3, h4, h5, h6, td, dd, li';
        var all = Array.from(document.querySelectorAll(leafSelector));
        var lcParts = labelParts.map(function(p) { return p.toLowerCase(); });

        for (var i = 0; i < all.length; i++) {
          var el = all[i];
          // Reject elements with children — we want leaf nodes
          if (el.children && el.children.length > 0) continue;
          var ownText = (el.textContent || '').trim();
          var ownTextLc = ownText.toLowerCase();

          var matched = false;
          for (var j = 0; j < lcParts.length; j++) {
            if (ownTextLc === lcParts[j]) { matched = true; break; }
          }
          if (!matched) continue;

          // Walk up the DOM until we find a parent with sibling content.
          var node = el;
          for (var depth = 0; depth < 4; depth++) {
            var parent = node.parentElement;
            if (!parent) break;
            // Inspect siblings within parent
            var sibs = Array.from(parent.children);
            for (var s = 0; s < sibs.length; s++) {
              var sib = sibs[s];
              if (sib === node) continue;
              var sibText = (sib.textContent || '').trim();
              if (isPlausibleValue(sibText)) return sibText;
            }
            node = parent;
          }
        }
        return null;
      }

      // (A) Class-pattern selectors — CarInfo uses CSS-modules.
      // Match by partial class name (case-insensitive). Survives hash rotation.
      function bySelectors(selectors) {
        for (var i = 0; i < selectors.length; i++) {
          var el = document.querySelector(selectors[i]);
          if (el) {
            var t = (el.textContent || '').trim();
            if (t && t.length > 1) return t;
          }
        }
        return null;
      }

      var byClass = {};
      byClass.ownerName    = bySelectors(['[class*="ownerName" i]', '[class*="owner_name" i]', '[class*="OwnerName" i]']);
      byClass.makeModel    = bySelectors(['[class*="vehicalModel" i]', '[class*="vehicleModel" i]', '[class*="MakerModel" i]', '[class*="makerModel" i]']);
      byClass.fuelType     = bySelectors(['[class*="fuelType" i]', '[class*="fuel_type" i]', '[class*="FuelType" i]']);
      byClass.regDate      = bySelectors(['[class*="registrationDate" i]', '[class*="regDate" i]']);
      byClass.color        = bySelectors(['[class*="color_value" i]', '[class*="vehicleColor" i]']);
      byClass.chassis      = bySelectors(['[class*="chassis" i]']);
      byClass.engine       = bySelectors(['[class*="engineNo" i]', '[class*="engine_no" i]']);

      // (B) Label-pair scrape — exact match + parent-sibling walk.
      var scrape = {};
      scrape.ownerName        = byClass.ownerName     || findValue(['Owner Name', 'Registered Owner']);
      scrape.makeModel        = byClass.makeModel     || findValue(['Make & Model', 'Maker Model']);
      scrape.make             = findValue(['Maker', 'Manufacturer', 'Make']);
      scrape.model            = findValue(['Model', 'Vehicle Model']);
      scrape.variant          = findValue(['Variant']);
      scrape.manufacturingYear= findValue(['Manufacturing Year', 'Mfg Year', 'Year']);
      scrape.fuelType         = byClass.fuelType      || findValue(['Fuel Type', 'Fuel']);
      scrape.color            = byClass.color         || findValue(['Color', 'Colour']);
      scrape.chassisNo        = byClass.chassis       || findValue(['Chassis Number', 'Chassis No']);
      scrape.engineNo         = byClass.engine        || findValue(['Engine Number', 'Engine No']);
      scrape.insuranceExpiry  = findValue(['Insurance Expiry', 'Insurance Upto', 'Insurance']);
      scrape.pucExpiry        = findValue(['PUC Expiry', 'PUC Upto', 'Pollution']);
      scrape.fitnessExpiry    = findValue(['Fitness Expiry', 'Fitness Upto', 'Fitness']);
      scrape.roadTaxExpiry    = findValue(['Road Tax', 'Tax Upto']);
      scrape.registrationDate = byClass.regDate       || findValue(['Registration Date', 'Reg Date']);
      scrape.rto              = findValue(['Registered RTO', 'RTO Office', 'RTO']);
      scrape.rcStatus         = findValue(['RC Status']);
      scrape.vehicleClass     = findValue(['Vehicle Class', 'Vehicle Type']);
      scrape.normsType        = findValue(['Emission Norms', 'Norms Type']);
      scrape.seatingCapacity  = findValue(['Seating Capacity']);
      scrape.hypothecation    = findValue(['Hypothecation', 'Financier']);

      // (C) Full-text regex — pull values from rendered page text.
      // CarInfo renders pairs like "Maker\\nHONDA" or "Fuel Type\\nPETROL".
      var allText = document.body ? (document.body.innerText || '') : '';

      function textRegex(label) {
        // Labels are plain words (Maker, Fuel Type, etc.) — no regex
        // special chars, no escaping needed. Try multiple layout patterns:
        //   1. Label\\nValue (card layout)
        //   2. Label: Value (inline)
        var patterns = [
          '(?:^|\\\\n)\\\\s*' + label + '\\\\s*\\\\n+\\\\s*([^\\\\n]{1,80})',
          label + '\\\\s*[:\\\\-]\\\\s*([^\\\\n]{1,80})',
        ];
        for (var p = 0; p < patterns.length; p++) {
          var re = new RegExp(patterns[p], 'i');
          var m = allText.match(re);
          if (m && m[1]) {
            var v = m[1].trim();
            if (isPlausibleValue(v)) return v;
          }
        }
        return null;
      }

      if (!scrape.make)              scrape.make             = textRegex('Maker') || textRegex('Make');
      if (!scrape.model)             scrape.model            = textRegex('Model') || textRegex('Vehicle Model');
      if (!scrape.variant)           scrape.variant          = textRegex('Variant');
      if (!scrape.manufacturingYear) scrape.manufacturingYear= textRegex('Manufacturing Year') || textRegex('Mfg Year') || textRegex('Year of Manufacture');
      if (!scrape.fuelType)          scrape.fuelType         = textRegex('Fuel Type') || textRegex('Fuel');
      if (!scrape.color)             scrape.color            = textRegex('Color') || textRegex('Colour');
      if (!scrape.chassisNo)         scrape.chassisNo        = textRegex('Chassis Number') || textRegex('Chassis No') || textRegex('Chassis');
      if (!scrape.engineNo)          scrape.engineNo         = textRegex('Engine Number') || textRegex('Engine No') || textRegex('Engine');
      if (!scrape.insuranceExpiry)   scrape.insuranceExpiry  = textRegex('Insurance Expiry') || textRegex('Insurance Upto') || textRegex('Insurance Validity');
      if (!scrape.pucExpiry)         scrape.pucExpiry        = textRegex('PUC Expiry') || textRegex('PUC Upto') || textRegex('Pollution');
      if (!scrape.fitnessExpiry)     scrape.fitnessExpiry    = textRegex('Fitness Expiry') || textRegex('Fitness Upto') || textRegex('Fitness Validity');
      if (!scrape.roadTaxExpiry)     scrape.roadTaxExpiry    = textRegex('Road Tax') || textRegex('Tax Upto');
      if (!scrape.registrationDate)  scrape.registrationDate = textRegex('Registration Date') || textRegex('Reg Date');
      if (!scrape.rto)               scrape.rto              = textRegex('Registered RTO') || textRegex('RTO Office') || textRegex('RTO');
      if (!scrape.rcStatus)          scrape.rcStatus         = textRegex('RC Status') || textRegex('Status');
      if (!scrape.vehicleClass)      scrape.vehicleClass     = textRegex('Vehicle Class') || textRegex('Vehicle Type') || textRegex('Class of Vehicle');
      if (!scrape.normsType)         scrape.normsType        = textRegex('Emission Norms') || textRegex('Norms Type') || textRegex('Norms');
      if (!scrape.seatingCapacity)   scrape.seatingCapacity  = textRegex('Seating Capacity');
      if (!scrape.hypothecation)     scrape.hypothecation    = textRegex('Hypothecation') || textRegex('Financier') || textRegex('Financed By');

      // If "Make & Model" combined, split on first whitespace into make + model.
      if (scrape.makeModel && !scrape.make && !scrape.model) {
        var mm = scrape.makeModel.split(/\\s+/);
        if (mm.length >= 2) {
          scrape.make = mm[0];
          scrape.model = mm.slice(1).join(' ');
        }
      }

      results.scraped = scrape;
      return results;
    })()`);


    // Save debug files for offline inspection of scrape failures.
    try {
        const timestamp = Date.now();
        const html = await page.content();
        fs.writeFileSync(`extraction_${timestamp}.html`, html);
        const bodyText = await page.evaluate('document.body ? document.body.innerText : ""');
        fs.writeFileSync(`extraction_${timestamp}.txt`, String(bodyText));
        logger.info({ regNo, scraped: (data as any)?.scraped, ts: timestamp }, '[carinfo-pw] DOM scrape result');
    } catch (e) {}

    await playwrightSessionManager.closeSession(sessionId);

    // Attach any captured API responses to the returned data
    const apiResponses = (session as any).apiResponses || [];

    // Log every captured API URL so we can identify CarInfo's authenticated
    // vehicle-data endpoint and target it directly in future.
    const apiRequests = (session as any).apiRequests || [];
    try {
      const urls = apiResponses
        .map((r: any) => r?.url)
        .filter((u: any): u is string => typeof u === 'string');
      logger.info({ regNo, capturedUrls: urls.slice(0, 50) }, '[carinfo-pw] captured API URLs');
      const ts = Date.now();
      // Save full request + response bodies for offline inspection.
      const allCapture = {
        requests: apiRequests,
        responses: apiResponses,
      };
      fs.writeFileSync(`api_capture_${ts}.json`, JSON.stringify(allCapture, null, 2));
      logger.info({ regNo, file: `api_capture_${ts}.json`, requestCount: apiRequests.length, responseCount: apiResponses.length }, '[carinfo-pw] saved full API capture');
    } catch (e) { /* non-fatal */ }

    // Build a clean VehicleRecord. Three sources, in priority:
    //   1. Authenticated API responses captured during the session — these
    //      contain decrypted VAHAN JSON with real keys (maker_desc, model,
    //      etc.). Most reliable.
    //   2. In-browser DOM scrape (data.scraped) — label-text heuristic.
    //   3. Non-OTP HTTP page fetch — broken on CarInfo's new encrypted
    //      pages but kept as last-ditch fallback.
    let parsed: VehicleRecord | null = null;

    // (1) Walk every captured API response, looking for vehicle-shaped JSON.
    for (const res of apiResponses) {
      if (!res?.json || typeof res.json !== 'object') continue;
      try {
        const obj = res.json as Record<string, unknown>;
        const v = findVehicleObject(obj);
        if (v) {
          const rec = mapToVehicleRecord(v, regNo);
          if (rec.make || rec.ownerName || rec.fuelType) {
            parsed = rec;
            logger.info({ regNo, url: res.url }, '[carinfo-pw] parsed from API response');
            break;
          }
        }
      } catch { /* continue */ }
    }

    // (2) Use the in-browser scrape if API parse missed.
    if (!parsed) {
      const sc = (data as any)?.scraped ?? {};
      if (sc.make || sc.model || sc.ownerName) {
        const yr = sc.manufacturingYear ? Number(String(sc.manufacturingYear).match(/\b(19\d{2}|20\d{2})\b/)?.[1]) : NaN;
        const seating = sc.seatingCapacity ? Number(String(sc.seatingCapacity).replace(/[^\d]/g, '')) : NaN;
        const isoDate = (s?: string): string | undefined => {
          if (!s) return undefined;
          if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
          const dmy = s.match(/^(\d{1,2})[-/\s.,]+(\d{1,2}|[A-Za-z]{3,})[-/\s.,]+(\d{4})$/);
          if (dmy) {
            const months: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
            const m = isNaN(Number(dmy[2]))
              ? months[dmy[2]!.toLowerCase().slice(0, 3)]
              : String(Number(dmy[2])).padStart(2, '0');
            if (m) return `${dmy[3]}-${m}-${String(dmy[1]!).padStart(2, '0')}`;
          }
          return undefined;
        };

        parsed = {
          registrationNo: regNo,
          make: sc.make ? String(sc.make).toUpperCase() : undefined,
          model: sc.model ? String(sc.model).toUpperCase() : undefined,
          variant: sc.variant ? String(sc.variant).toUpperCase() : undefined,
          manufacturingYear: Number.isFinite(yr) && yr >= 1900 && yr <= 2100 ? yr : undefined,
          fuelType: sc.fuelType ? String(sc.fuelType).toUpperCase() : undefined,
          color: sc.color ? String(sc.color).toUpperCase() : undefined,
          ownerName: sc.ownerName ? String(sc.ownerName).toUpperCase() : undefined,
          chassisLast4: sc.chassisNo ? String(sc.chassisNo).replace(/\s+/g, '').slice(-4).toUpperCase() : undefined,
          rtoCode: sc.rto ? String(sc.rto).match(/[A-Z]{2}[\-\s]?\d{1,2}/)?.[0]?.replace(/\s|-/g, '') : undefined,
          insuranceExpiry: isoDate(sc.insuranceExpiry),
          pucExpiry: isoDate(sc.pucExpiry),
          fitnessExpiry: isoDate(sc.fitnessExpiry),
          roadTaxExpiry: isoDate(sc.roadTaxExpiry),
          registrationDate: isoDate(sc.registrationDate),
          engineNo: sc.engineNo ? String(sc.engineNo) : undefined,
          rcStatus: sc.rcStatus ? String(sc.rcStatus).toUpperCase() : undefined,
          vehicleClass: sc.vehicleClass ? String(sc.vehicleClass).toUpperCase() : undefined,
          normsType: sc.normsType ? String(sc.normsType).toUpperCase() : undefined,
          seatingCapacity: Number.isFinite(seating) && seating > 0 ? seating : undefined,
          hypothecation: sc.hypothecation ? String(sc.hypothecation) : undefined,
        };
        logger.info({ regNo, fields: Object.keys(parsed).filter(k => (parsed as any)[k] !== undefined) }, '[carinfo-pw] parsed from DOM scrape');
      }
    }

    // (3) Last-ditch: non-OTP HTTP page (works only on un-encrypted pages).
    if (!parsed) {
      try { parsed = await fetchCarInfoRC(regNo); } catch { /* ignore */ }
    }

    return {
        regNo,
        parsed,
        raw: {
            ...(data as any),
            apiResponses
        },
        source: 'carinfo-playwright'
    };
  } catch (error) {
    // CAPTURE DEBUG INFO ON ANY FAILURE
    try {
        const timestamp = Date.now();
        await page.screenshot({ path: `error_${timestamp}.png` });
        const html = await page.content();
        fs.writeFileSync(`error_${timestamp}.html`, html);
        logger.info({ sessionId }, `Saved debug files: error_${timestamp}.png/html`);
    } catch (e) {
        logger.error({ error: e }, 'Failed to save debug files');
    }

    await playwrightSessionManager.closeSession(sessionId);
    logger.error({ error, regNo }, '[carinfo-pw] Failed to verify OTP');
    throw error;
  }
}
