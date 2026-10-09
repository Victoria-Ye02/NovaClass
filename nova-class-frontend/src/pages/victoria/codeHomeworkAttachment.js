const CODE_EXTENSIONS = /\.(?:js|jsx|ts|tsx|py|java|c|cc|cpp|cs|php|rb|go|rs|html|css|sql|txt)$/i;

export function isReadableCodeFile(file) {
  return CODE_EXTENSIONS.test(file?.name || "") || file?.type?.startsWith("text/");
}

export function attachmentKind(file) {
  if (file?.type?.startsWith("image/")) return "photo";
  if (isReadableCodeFile(file)) return "code";
  return "document";
}
