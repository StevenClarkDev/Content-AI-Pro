import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders the portal headline", () => {
  render(<App />);
  expect(screen.getByText(/Welcome Back|Social Media/i)).toBeInTheDocument();
});
