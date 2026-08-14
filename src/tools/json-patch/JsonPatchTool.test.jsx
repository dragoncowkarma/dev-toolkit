import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import JsonPatchTool from "./JsonPatchTool.jsx";

afterEach(cleanup);

function fillApplyInputs(document, patch) {
  fireEvent.change(screen.getByLabelText("Document JSON"), {
    target: { value: document },
  });
  fireEvent.change(screen.getByLabelText("Patch JSON"), {
    target: { value: patch },
  });
}

describe("JsonPatchTool", () => {
  it("applies a patch and renders the formatted JSON result", () => {
    render(<JsonPatchTool />);
    fillApplyInputs(
      '{"items":[1]}',
      '[{"op":"add","path":"/items/-","value":2}]',
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply patch" }));
    expect(screen.getByRole("heading", { name: "Result" })).toBeInTheDocument();
    expect(
      screen.getByText('"items": [', { exact: false }),
    ).toBeInTheDocument();
  });

  it("resolves a pointer through the explicit action", () => {
    render(<JsonPatchTool />);
    fillApplyInputs('{"items":[{"name":"Ada"}]}', "[]");
    fireEvent.change(screen.getByLabelText("JSON Pointer"), {
      target: { value: "/items/0/name" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolve pointer" }));
    expect(screen.getByText('"Ada"')).toBeInTheDocument();
  });

  it("renders a role alert and no result when application fails", () => {
    render(<JsonPatchTool />);
    fillApplyInputs('{"a":1}', '[{"op":"remove","path":"/missing"}]');
    fireEvent.click(screen.getByRole("button", { name: "Apply patch" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Operation 0");
    expect(
      screen.queryByRole("heading", { name: "Result" }),
    ).not.toBeInTheDocument();
  });

  it("generates an applicable patch from labelled source and target inputs", () => {
    render(<JsonPatchTool />);
    fireEvent.click(
      screen.getByRole("button", { name: "Generate patch mode" }),
    );
    fireEvent.change(screen.getByLabelText("Source JSON"), {
      target: { value: '{"a":1}' },
    });
    fireEvent.change(screen.getByLabelText("Target JSON"), {
      target: { value: '{"a":2,"b":true}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate patch" }));
    expect(screen.getByText('"replace"', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/"path": "\/a"/)).toBeInTheDocument();
  });

  it("loads a labelled sample for the apply mode", () => {
    render(<JsonPatchTool />);
    fireEvent.click(screen.getByRole("button", { name: "Load sample" }));
    expect(screen.getByLabelText("Document JSON").value).toContain("items");
    expect(screen.getByLabelText("Patch JSON").value).toContain("add");
    expect(screen.getByLabelText("JSON Pointer")).toHaveValue("/items/0");
  });
});
