export * from './emi.types.js';
// addMonthsIso is deliberately not re-exported here: the insurance barrel already
// exports a same-named, same-behaviour helper from the package root. Import the
// EMI variant (throws EmiError) from './emiDates.js' inside the package.
export { indianFy } from './emiDates.js';
export * from './emi.js';
