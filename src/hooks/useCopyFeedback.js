import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Manages transient copy feedback for boolean, keyed, or object status values.
 *
 * @param {object} [options] Hook configuration.
 * @param {*} [options.initialValue=null] Status shown before feedback is triggered.
 * @param {*} [options.resetValue=options.initialValue] Status restored after dismissal.
 * @param {number} [options.duration=1500] Auto-dismiss delay in milliseconds.
 * @returns {[*, (value: *) => void, () => void]} Current status, show, and dismiss functions.
 */
export function useCopyFeedback(
  { initialValue = null, resetValue = initialValue, duration = 1500 } = {}
) {
  const [feedback, setFeedback] = useState(initialValue);
  const timerRef = useRef(null);

  const clearFeedbackTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const dismissFeedback = useCallback(() => {
    clearFeedbackTimer();
    setFeedback(resetValue);
  }, [clearFeedbackTimer, resetValue]);

  const showFeedback = useCallback(
    (value) => {
      clearFeedbackTimer();
      setFeedback(value);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setFeedback((currentValue) => (Object.is(currentValue, value) ? resetValue : currentValue));
      }, duration);
    },
    [clearFeedbackTimer, duration, resetValue]
  );

  useEffect(() => clearFeedbackTimer, [clearFeedbackTimer]);

  return [feedback, showFeedback, dismissFeedback];
}
