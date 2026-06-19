/**
 * GullyScore Haptic Feedback Utility
 *
 * navigator.vibrate patterns for scoring actions.
 * Makes the app feel native-grade, not web-grade.
 * Wickets feel different in your hand from fours.
 */

/**
 * Light haptic on every run button press.
 */
export function hapticRun(): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(15);
  }
}

/**
 * Strong double-buzz on a wicket — feels like impact.
 */
export function hapticWicket(): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate([80, 20, 80]);
  }
}

/**
 * Staccato + long buzz on a six — celebration pattern.
 */
export function hapticSix(): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate([15, 5, 15, 5, 80]);
  }
}

/**
 * Medium haptic on a four — distinct from a single run.
 */
export function hapticFour(): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate([25, 10, 25]);
  }
}

/**
 * Light confirmation haptic for undo, extras, etc.
 */
export function hapticLight(): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(10);
  }
}

/**
 * Achievement unlock celebration pattern.
 */
export function hapticAchievement(): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate([30, 30, 30, 30, 80]);
  }
}
