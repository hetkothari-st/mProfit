import fs from 'fs';
import { playwrightSessionManager } from '../../lib/playwrightSessions.js';
import { logger } from '../../lib/logger.js';
import type { VehicleRecord } from './types.js';
import { fetchCarInfoRC, findVehicleObject, mapToVehicleRecord, decryptXdataprops, parseWebSections } from './carinfo.js';

const BASE_URL = 'https://www.carinfo.app/rc-details/';

// Injected into every page load via addInitScript.
// Intercepts JSON.parse to capture vehicle-shaped objects after CarInfo's
// client-side AES decryption of xdataprops. Also intercepts String.prototype.toString
// on CryptoJS WordArrays to grab the plaintext before JSON.parse is called.
const VEHICLE_CAPTURE_SCRIPT = `
(function() {
  var VEHICLE_KEYS = [
    'owner_name','ownerName','maker_desc','fuel_desc','color_desc','chassis_no',
    'engine_no','insurance_upto','insExpiry','pucc_upto','fit_upto','tax_upto',
    'mfg_year','mfgYear','manufacturing_year','reg_no','regnNo','vehicle_status',
    'rc_status','norms_type','seating_capacity','body_type','vehicle_class',
    'hypothecation','reg_date','registration_date',
  ];

  function looksLikeVehicle(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    var hits = 0;
    for (var i = 0; i < VEHICLE_KEYS.length; i++) {
      if (VEHICLE_KEYS[i] in obj) hits++;
      if (hits >= 2) return true;
    }
    return false;
  }

  function captureObj(obj) {
    if (looksLikeVehicle(obj)) {
      window.__vehicleCaptures = window.__vehicleCaptures || [];
      window.__vehicleCaptures.push(obj);
      return;
    }
    // Check common wrapper keys
    var wrappers = ['data','rc','rcData','vehicleData','rcDetails','vehicleDetails','result','rcInfo'];
    for (var i = 0; i < wrappers.length; i++) {
      var child = obj[wrappers[i]];
      if (looksLikeVehicle(child)) {
        window.__vehicleCaptures = window.__vehicleCaptures || [];
        window.__vehicleCaptures.push(child);
      }
    }
  }

  // Override JSON.parse — CarInfo calls this after AES.decrypt().toString(Utf8)
  var _origParse = JSON.parse;
  JSON.parse = function(text, reviver) {
    var result = _origParse.apply(this, arguments);
    try { captureObj(result); } catch (e) {}
    return result;
  };

  // Also try to intercept CryptoJS if it's available as a global
  function patchCryptoJS() {
    if (window.CryptoJS && window.CryptoJS.AES && !window.CryptoJS.AES.decrypt.__ciPatch) {
      var _origDecrypt = window.CryptoJS.AES.decrypt;
      window.CryptoJS.AES.decrypt = function(ciphertext, key, cfg) {
        var wa = _origDecrypt.apply(this, arguments);
        try {
          var plain = wa.toString(window.CryptoJS.enc.Utf8);
          if (plain && plain.length > 50 && plain.trim().startsWith('{')) {
            window.__rawDecrypts = window.__rawDecrypts || [];
            window.__rawDecrypts.push(plain);
          }
        } catch (e) {}
        return wa;
      };
      window.CryptoJS.AES.decrypt.__ciPatch = true;
    }
  }

  // Poll until CryptoJS loads (it's in a lazy chunk)
  var pollCount = 0;
  var pollId = setInterval(function() {
    patchCryptoJS();
    if (++pollCount > 200) clearInterval(pollId); // stop after 10s
  }, 50);
})();
`;

export async function initiateCarInfoScrape(regNo: string, mobileNo: string): Promise<string> {
  const cleanRegNo = regNo.replace(/\s+/g, '').toUpperCase();
  const session = await playwrightSessionManager.createSession(cleanRegNo);
  const { page } = session;

  // Inject vehicle capture script on every page load (including the post-OTP reload)
  await page.addInitScript(VEHICLE_CAPTURE_SCRIPT);

  // Capture all API responses for secondary extraction
  (session as any).apiResponses = [];
  (session as any).apiRequests = [];
  page.on('request', (request) => {
    try {
      const url = request.url();
      if (/api|rc|vehicle|otp|verify|auth|decrypt|key|user|profile/i.test(url)) {
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
      if (/api|rc|vehicle|otp|verify|auth|decrypt|key|user|profile/i.test(url)) {
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

    // Enter mobile number — try multiple selectors; CarInfo's input may lack an id
    const mobileInput = page.locator(
      '#mobileNumber, input[type="tel"], input[placeholder*="Mobile" i], input[placeholder*="mobile" i], input[placeholder*="phone" i]',
    ).first();
    await mobileInput.waitFor({ state: 'visible', timeout: 5000 });
    await mobileInput.click();
    await mobileInput.fill('');          // clear first
    await mobileInput.pressSequentially(mobileNo, { delay: 80 });
    // Verify value was accepted
    const filledVal = await mobileInput.inputValue().catch(() => '');
    logger.info({ regNo: cleanRegNo, filledLen: filledVal.length }, '[carinfo-pw] mobile number filled');

    // Click "Get OTP"
    const getOtpBtn = page.locator(
      'button:has-text("Get OTP"), button:has-text("Send OTP"), button:has-text("Request OTP"), button:has-text("Continue"), button[type="submit"]',
    ).first();
    await getOtpBtn.waitFor({ state: 'visible', timeout: 5000 });
    await getOtpBtn.click();

    // Wait for OTP screen to transition
    await page.waitForTimeout(2000);

    return session.id;
  } catch (error) {
    await playwrightSessionManager.closeSession(session.id);
    logger.error({ error, regNo: cleanRegNo }, '[carinfo-pw] Failed to initiate scrape');
    throw error;
  }
}

// Click CarInfo's expandHeader sections to load lazy data.
// Short delay per click — content loads fast once auth is set.
async function expandCarInfoSections(page: any): Promise<void> {
  await page.evaluate(`(async () => {
    var els = document.querySelectorAll('[class*="expandHeader"]');
    for (var i = 0; i < els.length; i++) {
      try { els[i].click(); } catch (e) {}
      await new Promise(function(r) { setTimeout(r, 300); });
    }
  })()`);
  try {
    await page.waitForLoadState('networkidle', { timeout: 4000 });
  } catch { /* continue */ }
}

// Check if JSON.parse intercept captured vehicle data yet.
async function hasCapturedData(page: any): Promise<boolean> {
  return page.evaluate('Array.isArray(window.__vehicleCaptures) && window.__vehicleCaptures.length > 0')
    .catch(() => false);
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
    // event chain on some controlled-input components.
    const otpInputs = page.locator('.login_otpContainer__zuj08 input, .otp-input input, input[maxlength="1"]');
    const inputCount = await otpInputs.count();

    if (inputCount > 1) {
      logger.info({ regNo, sessionId, inputCount }, '[carinfo-pw] Filling multi-input OTP');
      await otpInputs.first().click();
      for (let i = 0; i < otp.length; i++) {
        const ch = otp[i];
        if (!ch) continue;
        try {
          await otpInputs.nth(i).pressSequentially(ch, { delay: 50 });
        } catch {
          await page.keyboard.type(ch, { delay: 50 });
        }
      }
    } else {
      const otpInput = page.locator('input[id*="otp" i], input[placeholder*="OTP" i], input[type="number"], input[type="tel"], .otp-input');
      await otpInput.first().waitFor({ state: 'visible', timeout: 10000 });
      await otpInput.first().click();
      await otpInput.first().pressSequentially(otp, { delay: 50 });
    }
    await page.waitForTimeout(500);

    // CarInfo triggers a hard page reload of /rc-details/* after login.
    // The server uses the auth cookie to set isServerDataLoaded=true in
    // initialState and may embed decrypted vehicle data. Allow this reload.

    // Capture ALL carinfo.app API responses — also capture raw text for
    // auth/login endpoints where content-type may not be application/json.
    page.on('response', async (response: any) => {
      try {
        const url: string = response.url();
        if (url.includes('carinfo.app') && !url.includes('analytics') && !url.includes('gtag')) {
          const ct = response.headers()['content-type'] || '';
          if (ct.includes('application/json')) {
            const json = await response.json().catch(() => null);
            (session as any).apiResponses.push({ url, status: response.status(), json });
            logger.info({ regNo, sessionId, url, status: response.status() }, '[carinfo-pw] carinfo JSON response');
          } else if (/auth|login|otp/i.test(url)) {
            // Capture raw text for auth endpoints regardless of content-type
            const text = await response.text().catch(() => '');
            (session as any).apiResponses.push({ url, status: response.status(), rawText: text.slice(0, 2000) });
            logger.info({ regNo, sessionId, url, status: response.status(), ct, textLen: text.length }, '[carinfo-pw] carinfo auth response (raw)');
          }
        }
      } catch { /* ignore */ }
    });

    // Click verify — success signal is MODAL CLOSING, not a specific URL pattern.
    // CarInfo may rename their OTP endpoint at any time; the modal close is the
    // reliable indicator that authentication succeeded.
    const verifyBtnCandidates = [
      'button:has-text("CONFIRM OTP")',
      'button:has-text("Verify OTP")',
      'button:has-text("Verify")',
      'button:has-text("Submit OTP")',
      'button:has-text("Submit")',
      'button:has-text("Continue")',
      'button[type="submit"]',
      'button:has-text("Login")',
    ];

    const errorMsg = page.locator('.login_errorMessage__HwHb9, [class*="errorMessage"]');
    let verifyResponseBody: Record<string, unknown> | null = null;

    // Helper: check if OTP was rejected (error message visible)
    async function checkOtpError(): Promise<void> {
      try {
        if (await errorMsg.isVisible({ timeout: 500 })) {
          const text = await errorMsg.innerText();
          if (/incorrect|invalid|wrong|expired/i.test(text)) {
            throw new Error(`CarInfo OTP Error: ${text}`);
          }
        }
      } catch (e) {
        if (e instanceof Error && e.message.startsWith('CarInfo OTP Error:')) throw e;
        // isVisible timeout / not found — ok
      }
    }

    // CarInfo sometimes auto-submits when the last OTP digit is entered (no button needed).
    // Check for that first before clicking anything.
    const autoSubmitted = await page.waitForSelector(
      '.login_loginUiContainer__14OFb',
      { state: 'hidden', timeout: 3000 },
    ).then(() => true).catch(() => false);

    if (!autoSubmitted) {
      // Try each candidate button; success = modal closes within 10s
      let clicked = false;
      for (const sel of verifyBtnCandidates) {
        const btn = page.locator(sel).first();
        try {
          const visible = await btn.isVisible({ timeout: 800 });
          if (!visible) continue;
        } catch { continue; }
        try {
          await btn.click({ timeout: 2000 });
          clicked = true;
          logger.info({ regNo, sessionId, button: sel }, '[carinfo-pw] clicked verify button');
          // Short wait for error message to appear (wrong OTP)
          await page.waitForTimeout(1500);
          await checkOtpError();
          // Check if modal closed after this click
          const closed = await page.waitForSelector(
            '.login_loginUiContainer__14OFb',
            { state: 'hidden', timeout: 8000 },
          ).then(() => true).catch(() => false);
          if (closed) break;
          logger.warn({ regNo, sessionId, button: sel }, '[carinfo-pw] modal still visible after click — trying next button');
        } catch (e) {
          if (e instanceof Error && e.message.startsWith('CarInfo OTP Error:')) throw e;
          logger.warn({ regNo, sessionId, button: sel, err: e instanceof Error ? e.message : String(e) }, '[carinfo-pw] button click failed');
        }
      }

      if (!clicked) {
        // No button found — log page state for debugging
        const pageText = await page.evaluate('document.body ? document.body.innerText.slice(0, 500) : ""').catch(() => '');
        logger.error({ regNo, sessionId, pageText }, '[carinfo-pw] No verify button found on OTP screen');
        throw new Error('CarInfo OTP screen: no verify button found — page may have changed');
      }

      // Final check: wait up to 5 more seconds for modal to close
      const finalClosed = await page.waitForSelector(
        '.login_loginUiContainer__14OFb',
        { state: 'hidden', timeout: 5000 },
      ).then(() => true).catch(() => false);

      if (!finalClosed) {
        await checkOtpError();
        // Modal still up but no error = maybe it closed differently or selector changed
        logger.warn({ sessionId }, '[carinfo-pw] Login modal selector not found/closed — proceeding anyway');
      }
    } else {
      // Auto-submitted — check for errors
      await checkOtpError();
    }

    // Capture final verifyOtp response body if any were collected
    const allApiResps: any[] = (session as any).apiResponses || [];
    const verifyResp = allApiResps.find((r: any) => r?.url && /otp|verify|auth|login/i.test(r.url) && r.json);
    if (verifyResp) {
      verifyResponseBody = verifyResp.json;
      logger.info({ regNo, url: verifyResp.url, keys: Object.keys(verifyResp.json || {}).slice(0, 10) }, '[carinfo-pw] verify response body captured');
    }

    logger.info({ regNo, sessionId }, '[carinfo-pw] OTP accepted — waiting for page reload with auth cookie');

    // Wait for CarInfo to trigger the post-login page reload.
    // The server reads the auth cookie and sets isServerDataLoaded=true in
    // initialState, potentially embedding decrypted vehicle data.
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 });
    } catch {
      // Navigation may not fire if CarInfo does SPA routing — continue anyway
      await page.waitForTimeout(2000);
    }
    await page.waitForTimeout(1500);

    // Read xdataprops from __NEXT_DATA__ and decrypt with static AES key.
    // Authenticated page reload returns a larger xdataprops with full details.
    const xdataResult = await page.evaluate(`(function() {
      try {
        var s = document.getElementById('__NEXT_DATA__');
        if (!s) return null;
        var nd = JSON.parse(s.innerText);
        var pp = nd.props && nd.props.pageProps;
        return {
          xdataprops: pp && pp.xdataprops,
          isLoggedIn: pp && pp.initialState && pp.initialState.auth && pp.initialState.auth.isLoggedIn,
        };
      } catch(e) { return null; }
    })()`).catch(() => null) as { xdataprops?: string; isLoggedIn?: boolean } | null;

    logger.info({ regNo, xdataLen: xdataResult?.xdataprops?.length, isLoggedIn: xdataResult?.isLoggedIn }, '[carinfo-pw] xdataprops after auth reload');

    // Check if JSON.parse intercept also captured data
    if (!await hasCapturedData(page)) {
      // Click expand headers in case the page needs interaction to reveal data
      await expandCarInfoSections(page);
      await page.waitForTimeout(1000);
    }

    // Detect rate-limit page before scraping
    const bodyText = await page.evaluate('document.body ? document.body.innerText : ""').catch(() => '');
    const bt = String(bodyText).toLowerCase();
    if (bt.includes('search limit has been exhausted') || bt.includes('multiple vehicles search detected') || bt.includes('download the carinfo app for free unlimited')) {
      await playwrightSessionManager.closeSession(sessionId);
      throw new Error(
        'CarInfo daily search limit exhausted on this network. Wait 24h and retry, or use the CarInfo Android app for unlimited searches.',
      );
    }

    // Save debug files
    try {
      const timestamp = Date.now();
      const html = await page.content();
      fs.writeFileSync(`extraction_${timestamp}.html`, html);
      const bodyTextDebug = await page.evaluate('document.body ? document.body.innerText : ""').catch(() => '');
      fs.writeFileSync(`extraction_${timestamp}.txt`, String(bodyTextDebug));
      logger.info({ regNo, ts: timestamp }, '[carinfo-pw] saved extraction debug files');
    } catch (e) {}

    // Read vehicle captures from our JSON.parse interceptor
    const vehicleCaptures = (await page.evaluate('window.__vehicleCaptures || []').catch(() => [])) as unknown[];
    const rawDecrypts = (await page.evaluate('window.__rawDecrypts || []').catch(() => [])) as string[];

    // Read __NEXT_DATA__ initialState — after auth reload the server may embed
    // vehicle data in initialState.auth or a dedicated RC reducer
    const nextStateData = await page.evaluate(`(function() {
      try {
        var script = document.getElementById('__NEXT_DATA__');
        if (!script) return null;
        var nd = JSON.parse(script.innerText);
        var pp = nd && nd.props && nd.props.pageProps;
        return {
          auth: pp && pp.initialState && pp.initialState.auth,
          xdataprops: pp && pp.xdataprops,
          rc: pp && pp.rc,
          allKeys: pp ? Object.keys(pp) : [],
          authIsLoaded: pp && pp.initialState && pp.initialState.auth && pp.initialState.auth.isServerDataLoaded,
        };
      } catch(e) { return null; }
    })()`).catch(() => null) as any;

    logger.info({ regNo,
      captureCount: vehicleCaptures.length,
      decryptCount: rawDecrypts.length,
      authIsLoaded: nextStateData?.authIsLoaded,
      authKeys: nextStateData?.auth ? Object.keys(nextStateData.auth) : [],
      pagePropsKeys: nextStateData?.allKeys,
    }, '[carinfo-pw] captured data counts');

    // DOM scrape (as before but with improved selectors)
    const domData = await page.evaluate(`(function() {
      var results = { scraped: {} };

      var script = document.getElementById('__NEXT_DATA__');
      if (script) {
        try {
          var parsed = JSON.parse(script.innerText);
          results.nextData = (parsed && parsed.props && parsed.props.pageProps) ? parsed.props.pageProps : parsed;
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
        'Year of Manufacture', 'Unloaded Weight', 'Unladen Weight',
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
        if (!t || t.length < 1 || t.length > 100) return false;
        if (t === '-' || t.toLowerCase() === 'n/a' || t.toLowerCase() === 'na') return false;
        if (isKnownLabel(t)) return false;
        return true;
      }

      function findValue(labelParts) {
        var leafSelector = 'p, span, div, h1, h2, h3, h4, h5, h6, td, dd, li';
        var all = Array.from(document.querySelectorAll(leafSelector));
        var lcParts = labelParts.map(function(p) { return p.toLowerCase(); });

        for (var i = 0; i < all.length; i++) {
          var el = all[i];
          if (el.children && el.children.length > 0) continue;
          var ownText = (el.textContent || '').trim();
          var ownTextLc = ownText.toLowerCase();

          var matched = false;
          for (var j = 0; j < lcParts.length; j++) {
            if (ownTextLc === lcParts[j]) { matched = true; break; }
          }
          if (!matched) continue;

          var node = el;
          for (var depth = 0; depth < 4; depth++) {
            var parent = node.parentElement;
            if (!parent) break;
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
      byClass.ownerName = bySelectors(['[class*="ownerName" i]', '[class*="owner_name" i]']);
      byClass.makeModel  = bySelectors(['[class*="vehicalModel" i]', '[class*="vehicleModel" i]', '[class*="MakerModel" i]', '[class*="makerModel" i]']);
      byClass.fuelType   = bySelectors(['[class*="fuelType" i]', '[class*="fuel_type" i]', '[class*="FuelType" i]']);
      byClass.regDate    = bySelectors(['[class*="registrationDate" i]', '[class*="regDate" i]']);
      byClass.color      = bySelectors(['[class*="color_value" i]', '[class*="vehicleColor" i]', '[class*="colorValue" i]']);
      byClass.chassis    = bySelectors(['[class*="chassis" i]']);
      byClass.engine     = bySelectors(['[class*="engineNo" i]', '[class*="engine_no" i]']);

      var scrape = {};
      scrape.ownerName         = byClass.ownerName    || findValue(['Owner Name', 'Registered Owner']);
      scrape.makeModel         = byClass.makeModel    || findValue(['Make & Model', 'Maker Model']);
      scrape.make              = findValue(['Maker', 'Manufacturer', 'Make']);
      scrape.model             = findValue(['Model', 'Vehicle Model']);
      scrape.variant           = findValue(['Variant']);
      scrape.manufacturingYear = findValue(['Manufacturing Year', 'Mfg Year', 'Year', 'Year of Manufacture']);
      scrape.fuelType          = byClass.fuelType     || findValue(['Fuel Type', 'Fuel']);
      scrape.color             = byClass.color        || findValue(['Color', 'Colour']);
      scrape.chassisNo         = byClass.chassis      || findValue(['Chassis Number', 'Chassis No']);
      scrape.engineNo          = byClass.engine       || findValue(['Engine Number', 'Engine No']);
      scrape.insuranceExpiry   = findValue(['Insurance Expiry', 'Insurance Upto', 'Insurance']);
      scrape.pucExpiry         = findValue(['PUC Expiry', 'PUC Upto', 'Pollution']);
      scrape.fitnessExpiry     = findValue(['Fitness Expiry', 'Fitness Upto', 'Fitness']);
      scrape.roadTaxExpiry     = findValue(['Road Tax', 'Tax Upto']);
      scrape.registrationDate  = byClass.regDate      || findValue(['Registration Date', 'Reg Date']);
      scrape.rto               = findValue(['Registered RTO', 'RTO Office', 'RTO']);
      scrape.rcStatus          = findValue(['RC Status']);
      scrape.vehicleClass      = findValue(['Vehicle Class', 'Vehicle Type']);
      scrape.normsType         = findValue(['Emission Norms', 'Norms Type']);
      scrape.seatingCapacity   = findValue(['Seating Capacity']);
      scrape.hypothecation     = findValue(['Hypothecation', 'Financier']);
      scrape.unloadedWeight    = findValue(['Unloaded Weight', 'Unladen Weight']);

      var allText = document.body ? (document.body.innerText || '') : '';

      function textRegex(label) {
        var safe = label.replace(/[.*+?^()|[\\\\/]/g, '\\\\$&');
        var patterns = [
          '(?:^|\\n)\\s*' + safe + '\\s*\\n+\\s*([^\\n]{1,80})',
          safe + '\\s*[:\\-]\\s*([^\\n]{1,80})',
        ];
        for (var p = 0; p < patterns.length; p++) {
          var re = new RegExp(patterns[p], 'im');
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
      if (!scrape.unloadedWeight)    scrape.unloadedWeight   = textRegex('Unloaded Weight') || textRegex('Unladen Weight');

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

    const apiResponses = (session as any).apiResponses || [];
    const apiRequests  = (session as any).apiRequests  || [];

    try {
      const ts = Date.now();
      const allCapture = { requests: apiRequests, responses: apiResponses };
      fs.writeFileSync(`api_capture_${ts}.json`, JSON.stringify(allCapture, null, 2));
      logger.info({ regNo, file: `api_capture_${ts}.json`, reqCount: apiRequests.length, respCount: apiResponses.length }, '[carinfo-pw] saved API capture');
    } catch (e) { /* non-fatal */ }

    logger.info({ regNo, scraped: (domData as any)?.scraped }, '[carinfo-pw] DOM scrape result');

    await playwrightSessionManager.closeSession(sessionId);

    // ── Build VehicleRecord — priority order: ────────────────────────────────
    // 0. __NEXT_DATA__ initialState.auth (server-embedded after auth reload)
    // 1. JSON.parse captures (CarInfo's own client-side decryption result)
    // 2. Raw CryptoJS decrypt strings
    // 3. Authenticated API response objects
    // 4. DOM scrape
    // 5. Non-OTP HTTP fetch fallback
    let parsed: VehicleRecord | null = null;

    // (0a) Decrypt xdataprops with the static AES key — most reliable source.
    //      Authenticated reload gives a larger payload with full vehicle details.
    if (xdataResult?.xdataprops && xdataResult.xdataprops.length > 100) {
      try {
        const decrypted = decryptXdataprops(xdataResult.xdataprops);
        const sections = decrypted && (decrypted as any).data?.webSections;
        if (Array.isArray(sections)) {
          const rec = parseWebSections(sections, regNo);
          if (rec && (rec.fuelType || rec.insuranceExpiry || rec.pucExpiry || rec.rcStatus)) {
            parsed = rec;
            logger.info({ regNo, fields: Object.keys(rec).filter(k => (rec as any)[k]), xdataLen: xdataResult.xdataprops.length }, '[carinfo-pw] parsed from xdataprops decryption');
          }
        }
      } catch (e) {
        logger.warn({ regNo, err: e instanceof Error ? e.message : String(e) }, '[carinfo-pw] xdataprops decrypt failed');
      }
    }

    // (0b) initialState.auth from __NEXT_DATA__ — server may embed RC data here
    if (!parsed && nextStateData?.auth && typeof nextStateData.auth === 'object') {
      const authObj = nextStateData.auth as Record<string, unknown>;
      // Walk known sub-keys that might hold vehicle data
      const candidates = [authObj, authObj['rc'], authObj['rcData'], authObj['vehicleData'], authObj['userData']];
      for (const c of candidates) {
        if (c && typeof c === 'object') {
          const v = findVehicleObject(c as Record<string, unknown>) ?? (c as Record<string, unknown>);
          const rec = mapToVehicleRecord(v, regNo);
          if (rec.fuelType || rec.color || rec.insuranceExpiry || rec.engineNo) {
            parsed = rec;
            logger.info({ regNo, source: 'next_data_auth', fields: Object.keys(rec).filter(k => (rec as any)[k]) }, '[carinfo-pw] parsed from __NEXT_DATA__ initialState.auth');
            break;
          }
        }
      }
      if (!parsed) {
        logger.info({ regNo, authKeys: Object.keys(authObj), isLoaded: authObj['isServerDataLoaded'] }, '[carinfo-pw] initialState.auth has no vehicle fields');
      }
    }

    // (1) JSON.parse intercept captures
    for (const obj of vehicleCaptures as Record<string, unknown>[]) {
      try {
        const rec = mapToVehicleRecord(obj, regNo);
        if (rec.make || rec.ownerName || rec.fuelType) {
          parsed = rec;
          logger.info({ regNo, source: 'json_parse_capture', fields: Object.keys(rec).filter(k => (rec as any)[k]) }, '[carinfo-pw] parsed from JSON.parse capture');
          break;
        }
      } catch { /* continue */ }
    }

    // (2) Raw CryptoJS decrypt strings
    if (!parsed) {
      for (const plaintext of rawDecrypts as string[]) {
        try {
          const obj = JSON.parse(plaintext) as Record<string, unknown>;
          const v = findVehicleObject(obj) ?? obj;
          const rec = mapToVehicleRecord(v, regNo);
          if (rec.make || rec.ownerName || rec.fuelType) {
            parsed = rec;
            logger.info({ regNo, source: 'cryptojs_capture' }, '[carinfo-pw] parsed from CryptoJS capture');
            break;
          }
        } catch { /* continue */ }
      }
    }

    // (3) Authenticated API responses
    if (!parsed) {
      for (const res of apiResponses) {
        if (!res?.json || typeof res.json !== 'object') continue;
        try {
          const v = findVehicleObject(res.json as Record<string, unknown>);
          if (v) {
            const rec = mapToVehicleRecord(v, regNo);
            if (rec.make || rec.ownerName || rec.fuelType) {
              parsed = rec;
              logger.info({ regNo, url: res.url, source: 'api_response' }, '[carinfo-pw] parsed from API response');
              break;
            }
          }
        } catch { /* continue */ }
      }
    }

    // (4) DOM scrape
    if (!parsed) {
      const sc = (domData as any)?.scraped ?? {};
      if (sc.make || sc.model || sc.ownerName) {
        const yr = sc.manufacturingYear ? Number(String(sc.manufacturingYear).match(/\b(19\d{2}|20\d{2})\b/)?.[1]) : NaN;
        const seating = sc.seatingCapacity ? Number(String(sc.seatingCapacity).replace(/[^\d]/g, '')) : NaN;
        const weight = sc.unloadedWeight ? Number(String(sc.unloadedWeight).replace(/[^\d]/g, '')) : NaN;
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
          unloadedWeight: Number.isFinite(weight) && weight > 0 ? weight : undefined,
          hypothecation: sc.hypothecation ? String(sc.hypothecation) : undefined,
        };
        logger.info({ regNo, fields: Object.keys(parsed).filter(k => (parsed as any)[k] !== undefined), source: 'dom_scrape' }, '[carinfo-pw] parsed from DOM scrape');
      }
    }

    // (5) Last-ditch: non-OTP HTTP page fetch
    if (!parsed) {
      try { parsed = await fetchCarInfoRC(regNo); } catch { /* ignore */ }
    }

    return {
      regNo,
      parsed,
      raw: {
        ...(domData as any),
        apiResponses,
        vehicleCaptures,
        verifyResponseBody,
      },
      source: 'carinfo-playwright',
    };
  } catch (error) {
    try {
      const timestamp = Date.now();
      await page.screenshot({ path: `error_${timestamp}.png` });
      const html = await page.content();
      fs.writeFileSync(`error_${timestamp}.html`, html);
    } catch (e) {}
    await playwrightSessionManager.closeSession(sessionId);
    logger.error({ error, regNo }, '[carinfo-pw] Failed to verify OTP');
    throw error;
  }
}
