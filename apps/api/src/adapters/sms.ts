// SMS sender. `fake` prints the OTP to the API log, for development before DLT registration.
import { config } from "../config.js";

export interface SmsSender {
  sendOtp(phone: string, code: string): Promise<void>;
}

export const sentOtps: { phone: string; code: string }[] = []; // read by tests in fake mode

const fake: SmsSender = {
  async sendOtp(phone, code) {
    sentOtps.push({ phone, code });
    if (sentOtps.length > 100) sentOtps.shift();
    if (config().NODE_ENV !== "test") console.log(`[fake SMS] OTP for ${phone}: ${code}`);
  },
};

// MSG91 OTP API (needs a DLT-approved template). Not used until the client has an account.
const msg91: SmsSender = {
  async sendOtp(phone, code) {
    const c = config();
    const res = await fetch("https://control.msg91.com/api/v5/otp", {
      method: "POST",
      headers: { "content-type": "application/json", authkey: c.MSG91_AUTH_KEY! },
      body: JSON.stringify({ template_id: c.MSG91_TEMPLATE_ID, mobile: phone.replace("+", ""), otp: code }),
    });
    if (!res.ok) throw new Error(`MSG91 responded ${res.status}`);
  },
};

export const sms = (): SmsSender => (config().SMS_PROVIDER === "msg91" ? msg91 : fake);
