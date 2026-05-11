import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the portal headline', () => {
  render(<App />);
  expect(screen.getByAltText(/Content AI Pro/i)).toBeInTheDocument();
});
