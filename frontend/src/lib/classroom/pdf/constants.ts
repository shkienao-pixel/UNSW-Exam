// Stub for pdf constants
export const PDF_DEFAULTS = {}
export type PDFProviderId = 'local' | 'mathpix' | 'unpdf' | 'mineru'
export interface PDFProviderConfig { name: string; apiKey?: string }
export const PDF_PROVIDERS: Record<PDFProviderId, PDFProviderConfig> = {
  local: { name: 'Local' },
  mathpix: { name: 'Mathpix' },
  unpdf: { name: 'UnPDF' },
  mineru: { name: 'MinerU' },
}
