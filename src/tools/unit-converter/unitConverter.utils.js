export const UNIT_CATEGORIES = {
  length: {
    label: 'Length',
    units: [
      { id: 'mm', label: 'Millimeters (mm)' },
      { id: 'cm', label: 'Centimeters (cm)' },
      { id: 'm', label: 'Meters (m)' },
      { id: 'km', label: 'Kilometers (km)' },
      { id: 'in', label: 'Inches (in)' },
      { id: 'ft', label: 'Feet (ft)' },
      { id: 'yd', label: 'Yards (yd)' },
      { id: 'mi', label: 'Miles (mi)' },
    ],
  },
  weight: {
    label: 'Weight / Mass',
    units: [
      { id: 'mg', label: 'Milligrams (mg)' },
      { id: 'g', label: 'Grams (g)' },
      { id: 'kg', label: 'Kilograms (kg)' },
      { id: 'oz', label: 'Ounces (oz)' },
      { id: 'lb', label: 'Pounds (lb)' },
    ],
  },
  temperature: {
    label: 'Temperature',
    units: [
      { id: 'celsius', label: 'Celsius (°C)' },
      { id: 'fahrenheit', label: 'Fahrenheit (°F)' },
      { id: 'kelvin', label: 'Kelvin (K)' },
    ],
  },
  volume: {
    label: 'Volume',
    units: [
      { id: 'ml', label: 'Milliliters (mL)' },
      { id: 'l', label: 'Liters (L)' },
      { id: 'gal-us', label: 'US gallons (gal)' },
      { id: 'fl-oz-us', label: 'US fluid ounces (fl oz)' },
      { id: 'cup-us', label: 'US cups (cup)' },
    ],
  },
};

const RATIO_TO_BASE = {
  length: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 },
  weight: { mg: 0.000001, g: 0.001, kg: 1, oz: 0.028349523125, lb: 0.45359237 },
  volume: {
    ml: 0.001,
    l: 1,
    'gal-us': 3.785411784,
    'fl-oz-us': 0.0295735295625,
    'cup-us': 0.2365882365,
  },
};

function convertTemperature(value, fromUnit, toUnit) {
  const celsius = {
    celsius: value,
    fahrenheit: (value - 32) * 5 / 9,
    kelvin: value - 273.15,
  }[fromUnit];
  return {
    celsius,
    fahrenheit: (celsius * 9 / 5) + 32,
    kelvin: celsius + 273.15,
  }[toUnit];
}

/**
 * Converts a finite number between two units in the specified category.
 *
 * @param {number} value - The value to convert.
 * @param {keyof UNIT_CATEGORIES} category - The unit category.
 * @param {string} fromUnit - The source unit identifier.
 * @param {string} toUnit - The target unit identifier.
 * @returns {number} The converted value.
 * @throws {TypeError} When the value or unit identifiers are invalid.
 */
export function convertUnit(value, category, fromUnit, toUnit) {
  if (!Number.isFinite(value)) {
    throw new TypeError('Enter a valid number.');
  }
  if (!UNIT_CATEGORIES[category]) {
    throw new TypeError('Choose a valid unit category.');
  }
  if (category === 'temperature') {
    if (!UNIT_CATEGORIES.temperature.units.some(({ id }) => id === fromUnit)
      || !UNIT_CATEGORIES.temperature.units.some(({ id }) => id === toUnit)) {
      throw new TypeError('Choose valid temperature units.');
    }
    return convertTemperature(value, fromUnit, toUnit);
  }

  const ratios = RATIO_TO_BASE[category];
  if (!ratios[fromUnit] || !ratios[toUnit]) {
    throw new TypeError('Choose valid units for this category.');
  }
  return (value * ratios[fromUnit]) / ratios[toUnit];
}

/**
 * Parses input text as a finite number suitable for conversion.
 *
 * @param {string} value - User-entered text.
 * @returns {number | null} The parsed number, or null when input is invalid.
 */
export function parseConversionValue(value) {
  if (value.trim() === '') return null;
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

/**
 * Formats a conversion result to a selected number of decimal places.
 *
 * @param {number} value - The result to format.
 * @param {number} precision - Decimal places from zero through six.
 * @returns {string} The formatted result.
 */
export function formatConversionResult(value, precision) {
  return value.toFixed(precision);
}
