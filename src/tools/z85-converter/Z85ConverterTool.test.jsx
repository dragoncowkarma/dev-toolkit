import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Z85ConverterTool from "./Z85ConverterTool.jsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Z85ConverterTool", () => {
  it("encodes text with explicit zero padding when requested", async () => {
    render(<Z85ConverterTool />);
    fireEvent.change(screen.getByLabelText("Text"), {
      target: { value: "abc" },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("multiple of 4");

    fireEvent.click(screen.getByLabelText("Pad incomplete bytes with zeros"));
    await waitFor(() =>
      expect(screen.getByLabelText("Z85")).toHaveValue("vpAZD"),
    );
  });

  it("uses the specification sample and decodes to bytes", async () => {
    render(<Z85ConverterTool />);
    fireEvent.click(screen.getByRole("button", { name: "Use sample" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Z85")).toHaveValue("HelloWorld"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Decode" }));
    fireEvent.change(screen.getByLabelText("Z85"), {
      target: { value: "HelloWorld" },
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Hex bytes")).toHaveValue(
        "86 4F D2 6F B5 59 F7 5B",
      ),
    );
  });

  it("reports invalid Z85 input accessibly", async () => {
    render(<Z85ConverterTool />);
    fireEvent.click(screen.getByRole("button", { name: "Decode" }));
    fireEvent.change(screen.getByLabelText("Z85"), {
      target: { value: "abcd~" },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid Z85 character",
    );
  });

  it("copies output and announces success in a polite status region", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    render(<Z85ConverterTool />);
    fireEvent.change(screen.getByLabelText("Text"), {
      target: { value: "test" },
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Z85")).not.toHaveValue(""),
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByRole("status")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });
});
