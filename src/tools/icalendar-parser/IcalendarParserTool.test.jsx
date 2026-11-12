import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import IcalendarParserTool from './IcalendarParserTool.jsx';

describe('IcalendarParserTool', () => {
  it('shows parsed event data and a searchable table', () => {
    render(<IcalendarParserTool />);
    expect(screen.getByText('Team standup')).toBeInTheDocument();
    expect(screen.getByLabelText('Parse summary')).toHaveTextContent('Events1Errors0Warnings0');
    fireEvent.change(screen.getByLabelText('Filter events'), { target: { value: 'missing' } });
    expect(screen.getByText('No matching events.')).toBeInTheDocument();
  });

  it('announces validation errors', () => {
    render(<IcalendarParserTool />);
    fireEvent.change(screen.getByLabelText('iCalendar text'), {
      target: { value: 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nEND:VEVENT\nEND:VCALENDAR' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('validation errors found');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'VEVENT is missing required UID.'
    );
  });
});
