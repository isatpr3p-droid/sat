/* isatprep · site settings. Edit these values; nothing else needs to change. */
window.SAT_CONFIG = {
  // Shown on the welcome and results screens.
  brand: 'isatprep',
  community: 'isatprep',
  telegram: 'https://t.me/isatprep',        // link on the results page ("Back to the channel"). Leave '' to hide.

  // Google Apps Script web-app URL that saves results into your Google Sheet (see README.md → "Results sheet").
  // Leave '' while testing — results then stay on the device only.
  // Sheet: "isatprep results" (Google account isatpr3p@gmail.com) · Apps Script deployment "isatprep results v1".
  resultsUrl: 'https://script.google.com/macros/s/AKfycbyeQDEJoThNaWCdQOe2MzafXG257rtnXwhaCiaMvoexorM2U1YYgmvXWvsbEFbSQfA9/exec',

  // Desmos graphing calculator API key (isatprep's own key from Desmos).
  desmosKey: 'bb33e0cf722d4c86a5648b4b5dd872ff',

  // Time zone used to show opening/closing times (IANA name).
  timeZone: 'Asia/Tashkent',

  // Score estimate (the real SAT uses an unpublished scoring model).
  scoring: { hardSpan: 600, easySpan: 430, easyCap: 630 }
};
