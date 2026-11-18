const ABA_ROUTING_NUMBER_PATTERN = /^\d{9}$/;

/**
 * Validates a US ABA routing transit number.
 *
 * @param {string} routingNumber - The routing number to validate.
 * @returns {{valid: boolean, error: string}} The validation result and an error when invalid.
 */
export function validateAbaRoutingNumber(routingNumber) {
  if (typeof routingNumber !== 'string') {
    return { valid: false, error: 'Routing number can only contain digits.' };
  }

  if (routingNumber.length !== 9) {
    return { valid: false, error: 'Routing number must contain exactly 9 digits.' };
  }

  if (!ABA_ROUTING_NUMBER_PATTERN.test(routingNumber)) {
    return { valid: false, error: 'Routing number can only contain digits.' };
  }

  const federalReservePrefix = Number(routingNumber.slice(0, 2));
  const isAllowedPrefix =
    federalReservePrefix <= 12 ||
    (federalReservePrefix >= 21 && federalReservePrefix <= 32) ||
    (federalReservePrefix >= 61 && federalReservePrefix <= 72) ||
    federalReservePrefix === 80;

  if (!isAllowedPrefix) {
    return { valid: false, error: 'Routing number has an invalid Federal Reserve prefix.' };
  }

  const digits = Array.from(routingNumber, Number);
  const checksum =
    3 * (digits[0] + digits[3] + digits[6]) +
    7 * (digits[1] + digits[4] + digits[7]) +
    digits[2] +
    digits[5] +
    digits[8];

  if (checksum % 10 !== 0) {
    return { valid: false, error: 'Routing number checksum is invalid.' };
  }

  return { valid: true, error: '' };
}
