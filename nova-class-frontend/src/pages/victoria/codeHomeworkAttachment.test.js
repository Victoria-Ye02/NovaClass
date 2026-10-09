import { describe, expect, it } from "vitest";
import { attachmentKind, isReadableCodeFile } from "./codeHomeworkAttachment";

describe("code homework attachments", () => {
  it("recognizes screenshots, lesson documents, and source-code files", () => {
    expect(attachmentKind({ name: "loop.png", type: "image/png" })).toBe("photo");
    expect(attachmentKind({ name: "assignment.pdf", type: "application/pdf" })).toBe("document");
    expect(attachmentKind({ name: "Main.java", type: "text/x-java-source" })).toBe("code");
    expect(isReadableCodeFile({ name: "answer.py", type: "text/plain" })).toBe(true);
  });
});
