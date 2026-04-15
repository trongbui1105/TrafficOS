import { render, screen } from '@testing-library/react';
import { CongestionBadge } from './CongestionBadge';

describe('CongestionBadge', () => {
  it('shows "Severe" for speed below 10 km/h', () => {
    render(<CongestionBadge avgSpeed={5} congested={true} />);
    expect(screen.getByText('Severe')).toBeInTheDocument();
  });

  it('shows "Heavy" for speed in [10, 20)', () => {
    render(<CongestionBadge avgSpeed={15} congested={true} />);
    expect(screen.getByText('Heavy')).toBeInTheDocument();
  });

  it('shows "Slow" for speed in [20, 30)', () => {
    render(<CongestionBadge avgSpeed={25} congested={true} />);
    expect(screen.getByText('Slow')).toBeInTheDocument();
  });

  it('shows "Flowing" for speed ≥ 30', () => {
    render(<CongestionBadge avgSpeed={45} congested={false} />);
    expect(screen.getByText('Flowing')).toBeInTheDocument();
  });

  it('boundary: speed of exactly 10 is "Heavy"', () => {
    render(<CongestionBadge avgSpeed={10} congested={true} />);
    expect(screen.getByText('Heavy')).toBeInTheDocument();
  });

  it('boundary: speed of exactly 30 is "Flowing"', () => {
    render(<CongestionBadge avgSpeed={30} congested={false} />);
    expect(screen.getByText('Flowing')).toBeInTheDocument();
  });

  it('applies red colouring to severe state', () => {
    const { container } = render(<CongestionBadge avgSpeed={5} congested={true} />);
    expect(container.firstChild).toHaveClass('text-red-400');
  });

  it('applies emerald colouring to flowing state', () => {
    const { container } = render(<CongestionBadge avgSpeed={45} congested={false} />);
    expect(container.firstChild).toHaveClass('text-emerald-400');
  });
});
