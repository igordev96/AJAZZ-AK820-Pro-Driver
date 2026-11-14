import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '@/lib/build';
import { PageFooter } from './page-footer';

describe('PageFooter', () => {
  it('names the build that is running', () => {
    render(<PageFooter />);

    expect(screen.getByText(`build ${APP_VERSION}`)).toBeInTheDocument();
  });

  it('links to the repository', () => {
    render(<PageFooter />);

    const link = screen.getByRole('link', { name: /open the project on github/i });

    expect(link).toHaveAttribute('href', 'https://github.com/igordev96/AJAZZ-AK820-Pro-Driver');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
  });
});
