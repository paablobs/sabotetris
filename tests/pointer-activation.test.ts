import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requireFreshPointerActivation } from '../src/utils/pointerActivation.ts';

function setup() {
  const button = new EventTarget();
  let activations = 0;
  requireFreshPointerActivation(button as HTMLButtonElement, () => { activations++; });
  const emit = (type: string, properties: Record<string, unknown> = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, properties);
    button.dispatchEvent(event);
    return event;
  };
  const down = (pointerId = 1) => emit('pointerdown', { pointerId, isPrimary: true, button: 0 });
  const click = (pointerId = 1) => emit('click', { pointerId, detail: 1 });
  return { emit, down, click, activations: () => activations };
}

test('a compatibility click from the opening touch cannot activate a newly inserted button', () => {
  const button = setup();
  assert.equal(button.click().defaultPrevented, true);
  assert.equal(button.activations(), 0);
  button.down(); button.click();
  assert.equal(button.activations(), 1);
  button.click();
  assert.equal(button.activations(), 1, 'one gesture cannot authorize another click');
});

test('fresh pointer identity, cancellation and keyboard/assistive activation', () => {
  const button = setup();
  button.down(1); button.click(2);
  assert.equal(button.activations(), 0);
  for (const type of ['pointercancel', 'pointerleave', 'blur']) {
    button.down(); button.emit(type); button.click();
    assert.equal(button.activations(), 0);
  }
  button.emit('click', { detail: 0 });
  assert.equal(button.activations(), 1);
  button.down(); button.emit('click', { detail: 1 }); // Older MouseEvent without pointerId.
  assert.equal(button.activations(), 2);
});
