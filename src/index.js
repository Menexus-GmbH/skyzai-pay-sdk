// Public SDK exports, including typed merchant HTTP refusals and the legacy class alias.
import SkyzaiPay, { SkyzaiPayError } from './SkyzaiPay.js';
import Payment from './Payment.js';

export default SkyzaiPay;
export { SkyzaiPay, SkyzaiPayError, Payment };
// Deprecated name only; this alias uses the same Skyzai backend and API-key contract.
export { SkyzaiPay as AureusPay };
