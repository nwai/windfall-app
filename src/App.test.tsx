import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LotteryPlatformShell } from './components/lottery/LotteryPlatformShell';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const renderShell = () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root | null = null;

  act(() => {
    root = createRoot(container);
    root.render(<LotteryPlatformShell windfallExperience={<div>Windfall diagnostic workspace</div>} />);
  });

  return {
    container,
    unmount: () => {
      act(() => root?.unmount());
      container.remove();
    },
  };
};

const findButtonByText = (container: HTMLElement, text: RegExp): HTMLButtonElement => {
  const button = Array.from(container.querySelectorAll('button'))
    .find((candidate) => text.test(candidate.textContent ?? ''));
  if (!button) throw new Error(`Unable to find button matching ${text}`);
  return button;
};

test('renders the lottery game switcher with Windfall active by default', () => {
  const { container, unmount } = renderShell();

  expect(container.querySelector("[aria-label='Lottery game']")).not.toBeNull();
  expect(findButtonByText(container, /windfall/i).getAttribute('aria-pressed')).toBe('true');
  expect(container.textContent).toContain('Windfall diagnostic workspace');
  unmount();
});

test('switches from Windfall to the Powerball generator', () => {
  const { container, unmount } = renderShell();

  act(() => {
    findButtonByText(container, /powerball/i).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(container.textContent).toContain('Australian Powerball generator');
  expect(container.textContent).toContain('7 main numbers from 1-35 plus 1 Powerball from 1-20');
  unmount();
});
