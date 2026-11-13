import { Global, Module } from '@nestjs/common';
import { PDF_GENERATOR, PdfGeneratorPort } from '@shared/application/ports/pdf-generator.port';
import { SimplePdfGeneratorAdapter } from './simple-pdf-generator.adapter';

@Global()
@Module({
  providers: [
    SimplePdfGeneratorAdapter,
    { provide: PDF_GENERATOR, useExisting: SimplePdfGeneratorAdapter },
    { provide: PdfGeneratorPort, useExisting: SimplePdfGeneratorAdapter },
  ],
  exports: [PDF_GENERATOR, PdfGeneratorPort],
})
export class PdfModule {}
