export const PDF_GENERATOR = Symbol('PDF_GENERATOR');

export type PdfTextStyle = 'title' | 'heading' | 'body' | 'small';

/** One paragraph; long text is wrapped by the adapter. */
export interface PdfBlock {
  text: string;
  style?: PdfTextStyle;
  bold?: boolean;
  /** blank space before the block, in points */
  spaceBefore?: number;
}

export interface PdfDocumentDefinition {
  title: string;
  blocks: PdfBlock[];
}

/** Generates a PDF binary from a structured, text-only definition. */
export abstract class PdfGeneratorPort {
  abstract generate(definition: PdfDocumentDefinition): Promise<Buffer>;
}
