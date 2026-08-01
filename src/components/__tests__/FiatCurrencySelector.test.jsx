import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import FiatCurrencySelector from '../FiatCurrencySelector';

describe('FiatCurrencySelector', () => {
  it('renders default trigger class when triggerClassName is absent', () => {
    const { container } = render(<FiatCurrencySelector value="USD" onChange={() => {}} />);
    const trigger = container.querySelector('[role="combobox"]');
    expect(trigger.className).toContain('w-20');
  });

  it('applies custom triggerClassName when provided', () => {
    const { container } = render(
      <FiatCurrencySelector value="USD" onChange={() => {}} triggerClassName="w-32 h-9 text-sm" />,
    );
    const trigger = container.querySelector('[role="combobox"]');
    expect(trigger.className).toContain('w-32');
    expect(trigger.className).not.toContain('w-20');
  });

  it('renders only currency code when showName is absent', () => {
    const { container } = render(
      <FiatCurrencySelector value="USD" onChange={() => {}} />,
    );
    const selectItems = container.querySelectorAll('[role="option"]');
    // SelectItems render as data attributes or in portal; check the rendered content
    const html = container.innerHTML;
    expect(html).not.toContain('USD — USD');
    expect(html).toContain('USD');
  });

  it('renders code — label when showName is true', () => {
    const { container } = render(
      <FiatCurrencySelector value="USD" onChange={() => {}} showName />,
    );
    const html = container.innerHTML;
    // The trigger shows the selected value formatted with showName
    expect(html).toContain('USD — USD');
  });
});
