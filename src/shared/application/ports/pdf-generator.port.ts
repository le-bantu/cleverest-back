export const PDF_GENERATOR = Symbol('PDF_GENERATOR');

export interface PdfDocumentDefinition {
  title: string;
  /** Structured content the adapter renders (pdfmake docDefinition-compatible). */
  content: unknown;
}

/** Generates a PDF binary from a structured definition (pdfmake in infra). */
export abstract class PdfGeneratorPort {
  abstract generate(definition: PdfDocumentDefinition): Promise<Buffer>;
}
