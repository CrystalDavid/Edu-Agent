import { extname } from "node:path";

import type {
  FileCategory,
  FilePreviewKind
} from "@edu-agent/contracts";

export interface SupportedFileType {
  extension: string;
  mimeTypes: readonly string[];
  previewKind: FilePreviewKind;
}

export const supportedFileTypes: readonly SupportedFileType[] = [
  {
    extension: ".pdf",
    mimeTypes: ["application/pdf"],
    previewKind: "pdf"
  },
  {
    extension: ".png",
    mimeTypes: ["image/png"],
    previewKind: "image"
  },
  {
    extension: ".jpg",
    mimeTypes: ["image/jpeg"],
    previewKind: "image"
  },
  {
    extension: ".jpeg",
    mimeTypes: ["image/jpeg"],
    previewKind: "image"
  },
  {
    extension: ".gif",
    mimeTypes: ["image/gif"],
    previewKind: "image"
  },
  {
    extension: ".webp",
    mimeTypes: ["image/webp"],
    previewKind: "image"
  },
  {
    extension: ".md",
    mimeTypes: ["text/markdown", "text/plain"],
    previewKind: "text"
  },
  {
    extension: ".txt",
    mimeTypes: ["text/plain"],
    previewKind: "text"
  },
  {
    extension: ".docx",
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ],
    previewKind: "office"
  },
  {
    extension: ".pptx",
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    ],
    previewKind: "office"
  },
  {
    extension: ".xlsx",
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ],
    previewKind: "office"
  }
] as const;

const supportedByExtension = new Map(
  supportedFileTypes.map((entry) => [entry.extension, entry])
);

export interface ValidatedFileMetadata {
  originalFileName: string;
  extension: string;
  mimeType: string;
  previewKind: FilePreviewKind;
}

export function validateFileMetadata(input: {
  originalFileName: string;
  mimeType: string;
}): ValidatedFileMetadata {
  const originalFileName = input.originalFileName.trim();
  if (
    originalFileName.length < 1 ||
    originalFileName.length > 180 ||
    /[\u0000-\u001f\u007f]/u.test(originalFileName) ||
    /[\\/]/u.test(originalFileName) ||
    originalFileName === "." ||
    originalFileName === ".." ||
    originalFileName.includes("..")
  ) {
    throw new Error("The original file name is unsafe.");
  }
  const extension = extname(originalFileName).toLowerCase();
  const supported = supportedByExtension.get(extension);
  if (!supported) {
    throw new Error("The file extension is not supported.");
  }
  const mimeType = input.mimeType
    .split(";")[0]
    ?.trim()
    .toLowerCase();
  if (!mimeType || !supported.mimeTypes.includes(mimeType)) {
    throw new Error(
      "The declared MIME type does not match the file extension."
    );
  }
  return {
    originalFileName,
    extension,
    mimeType,
    previewKind: supported.previewKind
  };
}

export function assertFileSignature(input: {
  extension: string;
  firstBytesHex: string;
}): void {
  const prefix = input.firstBytesHex.toLowerCase();
  const expected = signaturePrefixes[input.extension];
  if (expected && !expected.some((value) => prefix.startsWith(value))) {
    throw new Error(
      "The file signature does not match the declared file type."
    );
  }
}

const signaturePrefixes: Record<string, readonly string[]> = {
  ".pdf": ["255044462d"],
  ".png": ["89504e470d0a1a0a"],
  ".jpg": ["ffd8ff"],
  ".jpeg": ["ffd8ff"],
  ".gif": ["474946383761", "474946383961"],
  ".webp": ["52494646"],
  ".docx": ["504b0304", "504b0506", "504b0708"],
  ".pptx": ["504b0304", "504b0506", "504b0708"],
  ".xlsx": ["504b0304", "504b0506", "504b0708"]
};

export function contentSummary(input: {
  category: FileCategory;
  originalFileName: string;
  extension: string;
  sizeBytes: number;
  extractedText?: string;
}): string {
  const format = input.extension.slice(1).toUpperCase();
  const kib = Math.max(1, Math.round(input.sizeBytes / 1024));
  const metadata = `${format} · ${kib} KiB · ${categoryLabel(input.category)} · ${input.originalFileName}`;
  return input.extractedText
    ? `${metadata} · 摘要：${input.extractedText}`
    : metadata;
}

export function previewKindForExtension(
  extension: string
): FilePreviewKind {
  return supportedByExtension.get(extension.toLowerCase())?.previewKind ??
    "unsupported";
}

function categoryLabel(category: FileCategory): string {
  return {
    lesson_plan: "教案",
    reference: "参考资料",
    courseware: "课件",
    assessment: "测评",
    worksheet: "讲义",
    report: "报告",
    other: "其他"
  }[category];
}
