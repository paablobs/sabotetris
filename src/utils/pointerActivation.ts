/**
 * A touch that opened a dialog may produce a compatibility click on its new
 * button without any pointerdown there. Require a fresh gesture, while keeping
 * keyboard and assistive activation (detail = 0) native and immediate.
 */
export function requireFreshPointerActivation(button: HTMLButtonElement, activate: () => void): void {
  let pointerId: number | null = null;
  const clear = () => { pointerId = null; };
  button.addEventListener('pointerdown', event => {
    pointerId = event.isPrimary && event.button === 0 ? event.pointerId : null;
  });
  button.addEventListener('pointercancel', clear);
  button.addEventListener('pointerleave', clear);
  button.addEventListener('blur', clear);
  button.addEventListener('click', event => {
    const fresh = pointerId !== null && (!('pointerId' in event) || event.pointerId === pointerId);
    clear();
    if (event.detail === 0 || fresh) activate();
    else { event.preventDefault(); event.stopPropagation(); }
  });
}
