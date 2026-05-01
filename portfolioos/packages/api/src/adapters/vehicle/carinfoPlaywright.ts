import fs from 'fs';
import { playwrightSessionManager } from '../../lib/playwrightSessions.js';
import { logger } from '../../lib/logger.js';
import { VehicleRecord } from './types.js';

const BASE_URL = 'https://www.carinfo.app/rc-details/';

export async function initiateCarInfoScrape(regNo: string, mobileNo: string): Promise<string> {
  const cleanRegNo = regNo.replace(/\s+/g, '').toUpperCase();
  const session = await playwrightSessionManager.createSession(cleanRegNo);
  const { page } = session;

  // Set up network interception to catch the actual API response with the vehicle data!
  // We'll attach it to the session object so verifyCarInfoOtp can read it.
  (session as any).apiResponses = [];
  page.on('response', async (response) => {
    try {
      const url = response.url();
      // Only care about API requests that might contain vehicle/RC data
      if (url.includes('api') || url.includes('rc') || url.includes('vehicle') || url.includes('search')) {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('application/json')) {
          const json = await response.json();
          (session as any).apiResponses.push({ url, json });
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
    
    // Fill OTP
    const otpInputs = page.locator('.login_otpContainer__zuj08 input, .otp-input input, input[maxlength="1"]');
    const inputCount = await otpInputs.count();
    
    if (inputCount > 1) {
        logger.info({ regNo, sessionId, inputCount }, '[carinfo-pw] Filling multi-input OTP');
        for (let i = 0; i < Math.min(otp.length, inputCount); i++) {
            const char = otp[i];
            if (char) await otpInputs.nth(i).fill(char);
        }
    } else {
        const otpInput = page.locator('input[id*="otp" i], input[placeholder*="OTP" i], input[type="number"], input[type="tel"], .otp-input');
        await otpInput.first().waitFor({ state: 'visible', timeout: 10000 });
        await otpInput.first().fill(otp);
    }

    // Click verify/submit - try even more common labels/types
    const verifyBtn = page.locator('button:has-text("CONFIRM OTP"), button:has-text("Verify"), button:has-text("Submit"), button:has-text("Login"), button:has-text("Continue"), button[type="submit"]');
    await verifyBtn.first().waitFor({ state: 'visible', timeout: 10000 });
    await verifyBtn.first().click();

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

    // CLICK ALL EXPANDABLE SECTIONS to reveal hidden data (now that we're logged in)
    // NOTE: Using string-based evaluate to prevent esbuild/tsx from injecting
    // __name helpers that don't exist in the browser context
    await page.evaluate(`(async () => {
        var headers = document.querySelectorAll('.expand_component_expandHeader__TAsoW, [class*="expandHeader"]');
        for (var i = 0; i < headers.length; i++) {
            var h = headers[i];
            if (h.innerHTML.includes('lockIcon') || !h.parentElement || !h.parentElement.innerHTML.includes('expand_component_expanded')) {
                h.click();
                await new Promise(function(r) { setTimeout(r, 300); });
            }
        }
    })()`);
    await page.waitForTimeout(1000);
    
    // Extract data
    // NOTE: Using string-based evaluate to prevent esbuild/tsx from injecting
    // __name helpers that cause "ReferenceError: __name is not defined" in browser
    const data = await page.evaluate(`(function() {
      var results = { _source: 'unknown', scraped: {} };

      // 1. Try __NEXT_DATA__
      var script = document.getElementById('__NEXT_DATA__');
      if (script) {
          try {
              var parsed = JSON.parse(script.innerText);
              results.nextData = (parsed && parsed.props && parsed.props.pageProps) ? parsed.props.pageProps : parsed;
              results._source = 'next_data';
          } catch (e) {}
      }
      
      // 2. Targeted Scrape
      var scrape = {};
      
      function findValue(labelParts) {
          var all = Array.from(document.querySelectorAll('p, span, div'));
          for (var i = 0; i < all.length; i++) {
              var el = all[i];
              var text = (el.textContent || '').toLowerCase();
              for (var j = 0; j < labelParts.length; j++) {
                  var p = labelParts[j].toLowerCase();
                  if (text === p || text.indexOf(p + ' ') === 0) {
                      var val = el.nextElementSibling ? (el.nextElementSibling.textContent || '').trim() : '';
                      if (!val || val.length < 2) {
                          var sub = el.parentElement ? el.parentElement.querySelector('[class*="SubTitle"], [class*="value"]') : null;
                          val = sub ? (sub.textContent || '').trim() : '';
                      }
                      if (val && val.length > 1) return val;
                  }
              }
          }
          return null;
      }

      var ownerEl = document.querySelector('.input_vehical_layout_ownerName__NHkpi');
      scrape.ownerName = findValue(['Owner Name', 'Registered Owner']) || 
                        (ownerEl ? ownerEl.textContent.trim() : null);
      
      var modelEl = document.querySelector('.input_vehical_layout_vehicalModel__1ABTF');
      scrape.model = findValue(['Make & Model', 'Model', 'Vehicle Model']) || 
                     (modelEl ? modelEl.textContent.trim() : null);

      scrape.make = findValue(['Maker', 'Manufacturer', 'Make']);
      scrape.fuelType = findValue(['Fuel Type', 'Fuel']);
      scrape.registrationDate = findValue(['Registration Date', 'Reg Date']);
      scrape.insuranceExpiry = findValue(['Insurance Expiry', 'Insurance Upto', 'Insurance']);
      scrape.pucExpiry = findValue(['PUC Expiry', 'PUC Upto', 'Pollution']);
      scrape.fitnessExpiry = findValue(['Fitness Expiry', 'Fitness Upto', 'Fitness']);
      scrape.chassisNo = findValue(['Chassis Number', 'Chassis No']);
      scrape.engineNo = findValue(['Engine Number', 'Engine No']);
      scrape.color = findValue(['Color', 'Colour']);
      scrape.rto = findValue(['Registered RTO', 'RTO Office', 'RTO']);

      results.scraped = scrape;
      return results;
    })()`);


    // Save debug file
    try {
        const timestamp = Date.now();
        const html = await page.content();
        fs.writeFileSync(`extraction_${timestamp}.html`, html);
    } catch (e) {}

    await playwrightSessionManager.closeSession(sessionId);

    // Attach any captured API responses to the returned data
    const apiResponses = (session as any).apiResponses || [];

    return {
        regNo,
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
