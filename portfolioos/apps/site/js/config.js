/* Site settings. Change the contact address here before launch. */
window.EP_CONFIG = {
  contactEmail: 'hello@everypaisa.in',
};

window.EP_CONTACT = {
  /* No backend yet: hand the message to the visitor's mail app. */
  send({ subject, body }) {
    const to = window.EP_CONFIG.contactEmail;
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  },
};
