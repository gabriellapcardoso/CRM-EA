/**
 * Zod validation schemas for FlowCRM forms
 *
 * Features:
 * - Standardized error codes for i18n
 * - Reusable field validators
 * - Type inference
 * - T033: Max length limits for security
 */
import { z } from 'zod';
import { ERROR_CODES, getErrorMessage } from './errorCodes';
import { isE164, normalizePhoneE164 } from '@/lib/phone';

// ============ MAX LENGTH CONSTANTS (T033) ============

const MAX_LENGTHS = {
  NAME: 200,
  EMAIL: 254, // RFC 5321
  PHONE: 30,
  TITLE: 200,
  COMPANY_NAME: 200,
  DESCRIPTION: 5000,
  NOTES: 10000,
  URL: 2000,
  SHORT_TEXT: 100,
  MEDIUM_TEXT: 500,
} as const;

// ============ HELPER FOR ERROR MESSAGES ============

const msg = (code: keyof typeof ERROR_CODES, params?: Record<string, string | number>) =>
  getErrorMessage(ERROR_CODES[code], params);

// ============ COMMON FIELD SCHEMAS ============

export const emailSchema = z
  .string({ message: msg('EMAIL_REQUIRED') })
  .min(1, msg('EMAIL_REQUIRED'))
  .max(MAX_LENGTHS.EMAIL, `Email deve ter no máximo ${MAX_LENGTHS.EMAIL} caracteres`)
  .email(msg('EMAIL_INVALID'));

export const phoneSchema = z
  .string()
  .optional()
  .transform(val => val || '')
  .pipe(
    z.string()
      .max(MAX_LENGTHS.PHONE, `Telefone deve ter no máximo ${MAX_LENGTHS.PHONE} caracteres`)
      .refine(val => val === '' || /^[\d\s\-\(\)\+]+$/.test(val), msg('PHONE_INVALID'))
  )
  .transform(val => normalizePhoneE164(val))
  .refine(val => val === '' || isE164(val), msg('PHONE_INVALID'));

/**
 * Função pública `requiredString` do projeto.
 *
 * @param {string} field - Parâmetro `field`.
 * @param {number} maxLength - Parâmetro `maxLength`.
 * @returns {ZodString} Retorna um valor do tipo `ZodString`.
 */
export const requiredString = (field: string, maxLength: number = MAX_LENGTHS.NAME) =>
  z.string({ message: msg('FIELD_REQUIRED', { field }) })
    .min(1, msg('FIELD_REQUIRED', { field }))
    .max(maxLength, `${field} deve ter no máximo ${maxLength} caracteres`);

export const optionalString = z
  .string()
  .max(MAX_LENGTHS.MEDIUM_TEXT, `Texto deve ter no máximo ${MAX_LENGTHS.MEDIUM_TEXT} caracteres`)
  .optional()
  .transform(val => val || '');

export const optionalLongString = z
  .string()
  .max(MAX_LENGTHS.DESCRIPTION, `Texto deve ter no máximo ${MAX_LENGTHS.DESCRIPTION} caracteres`)
  .optional()
  .transform(val => val || '');

export const currencySchema = z.coerce
  .number({ message: msg('NUMBER_REQUIRED', { field: 'Valor' }) })
  .min(0, msg('NUMBER_MUST_BE_POSITIVE', { field: 'Valor' }))
  .max(999999999999, 'Valor máximo excedido') // Max ~1 trillion
  .optional()
  .transform(val => val ?? 0);

/**
 * Função pública `requiredSelect` do projeto.
 *
 * @param {string} field - Parâmetro `field`.
 * @returns {ZodString} Retorna um valor do tipo `ZodString`.
 */
export const requiredSelect = (field: string) =>
  z
    .string({ message: msg('SELECTION_REQUIRED', { field }) })
    .min(1, msg('SELECTION_REQUIRED', { field }))
    .max(100, 'Seleção inválida');

/**
 * Função pública `requiredDate` do projeto.
 *
 * @param {string} field - Parâmetro `field`.
 * @returns {ZodString} Retorna um valor do tipo `ZodString`.
 */
export const requiredDate = (field: string) =>
  z.string({ message: msg('DATE_REQUIRED', { field }) })
    .min(1, msg('DATE_REQUIRED', { field }))
    .max(30, 'Data inválida');

// ============ CONTACT SCHEMAS ============

export const contactFormSchema = z.object({
  name: requiredString('Nome', MAX_LENGTHS.NAME),
  email: emailSchema,
  phone: phoneSchema,
  role: optionalString.pipe(z.string().max(MAX_LENGTHS.SHORT_TEXT)),
  companyName: optionalString.pipe(z.string().max(MAX_LENGTHS.COMPANY_NAME)),
});

export type ContactFormData = z.infer<typeof contactFormSchema>;

// ============ COMPANY SCHEMAS ============

export const companyFormSchema = z.object({
  name: requiredString('Nome da Empresa', MAX_LENGTHS.COMPANY_NAME),
  industry: optionalString.pipe(z.string().max(MAX_LENGTHS.SHORT_TEXT)),
  website: z
    .string()
    .max(MAX_LENGTHS.URL, `Website deve ter no máximo ${MAX_LENGTHS.URL} caracteres`)
    .optional()
    .or(z.literal(''))
    .transform(val => (val || '').trim())
    .transform(val => val.replace(/^https?:\/\//i, '').replace(/\/+$/g, ''))
    .refine(
      val => val === '' || /^[a-z0-9.-]+\.[a-z]{2,}.*$/i.test(val),
      'Website inválido'
    ),
});

export type CompanyFormData = z.infer<typeof companyFormSchema>;

// ============ DEAL SCHEMAS ============

export const dealFormSchema = z.object({
  title: requiredString('Nome do negócio', MAX_LENGTHS.TITLE),
  companyName: requiredString('Empresa', MAX_LENGTHS.COMPANY_NAME),
  value: currencySchema,
  contactName: optionalString.pipe(z.string().max(MAX_LENGTHS.NAME)),
  email: z.string()
    .max(MAX_LENGTHS.EMAIL, `Email deve ter no máximo ${MAX_LENGTHS.EMAIL} caracteres`)
    .email(msg('EMAIL_INVALID'))
    .optional()
    .or(z.literal('')),
  phone: phoneSchema,
});

export type DealFormData = z.infer<typeof dealFormSchema>;

// ============ ACTIVITY SCHEMAS ============

export const activityTypeSchema = z.enum([
  'CALL',
  'MEETING',
  'EMAIL',
  'TASK',
  'NOTE',
  'STATUS_CHANGE',
]);

export const activityFormTypeSchema = z.enum(['CALL', 'MEETING', 'EMAIL', 'TASK'], {
  message: msg('SELECTION_INVALID'),
});

export const activityFormSchema = z.object({
  title: requiredString('Título', MAX_LENGTHS.TITLE),
  type: activityFormTypeSchema,
  date: requiredDate('Data'),
  time: requiredString('Hora', 10),
  description: z.string().max(MAX_LENGTHS.DESCRIPTION).default(''),
  dealId: requiredSelect('Negócio'),
});

export type ActivityFormData = z.infer<typeof activityFormSchema>;

// ============ BOARD SCHEMAS ============

export const boardFormSchema = z.object({
  name: requiredString('Nome do board', MAX_LENGTHS.NAME),
  description: optionalLongString,
});

export type BoardFormData = z.infer<typeof boardFormSchema>;

// ============ SETTINGS SCHEMAS ============

export const lifecycleStageSchema = z.object({
  name: requiredString('Nome do estágio', MAX_LENGTHS.SHORT_TEXT),
  color: requiredString('Cor', 20),
});

export type LifecycleStageFormData = z.infer<typeof lifecycleStageSchema>;

// ============ AI CONFIG SCHEMAS ============

export const aiConfigSchema = z.object({
  provider: z.literal('google'),
  apiKey: z.string().max(200, 'API Key inválida').optional(),
  model: z.string().max(100, 'Modelo inválido').optional(),
});

export type AIConfigFormData = z.infer<typeof aiConfigSchema>;

// Export max lengths for use in forms
export { MAX_LENGTHS };

// Re-export error utilities
export { ERROR_CODES, getErrorMessage, setLocale, getLocale } from './errorCodes';

// =============================================================================
// MÓDULO CLIENTES (governança de carteira pós-venda)
// =============================================================================

export const NICHOS_CLIENTE = [
  'local',
  'ecommerce',
  'infoproduto',
  'servicos_digitais',
  'politico_mandato',
  'politico_eleitoral',
] as const;

export const ESTAGIOS_CLIENTE = [
  'lead',
  'contrato_assinado',
  'kickoff',
  'setup_concluido',
  'em_operacao',
  'churn',
] as const;

export const CATEGORIAS_CLIENTE = ['ouro', 'prata', 'bronze'] as const;

export const clientFormSchema = z.object({
  name: requiredString('Nome do Cliente', MAX_LENGTHS.COMPANY_NAME),
  niche: z.enum(NICHOS_CLIENTE).optional().or(z.literal('')),
  industry: optionalString.pipe(z.string().max(MAX_LENGTHS.SHORT_TEXT)),
  website: optionalString.pipe(z.string().max(MAX_LENGTHS.URL)),
  lifecycleStage: z.enum(ESTAGIOS_CLIENTE),
  category: z.enum(CATEGORIAS_CLIENTE).optional().or(z.literal('')),
  // Pontuação vazia é estado legítimo: cliente recém-cadastrado ainda não foi
  // avaliado, e isso é diferente de zero, que significa churn.
  // String no formulário, número no banco. `z.coerce.number()` e
  // `z.preprocess()` transformam o tipo de ENTRADA do schema e o
  // react-hook-form perde a inferência do campo; converter no envio é
  // explícito e não precisa de cast em lugar nenhum.
  healthScore: z
    .string()
    .optional()
    .refine(v => !v || (/^\d{1,3}$/.test(v) && Number(v) <= 100), 'Informe de 0 a 100'),
});

export type ClientFormData = z.output<typeof clientFormSchema>;

export const contractFormSchema = z
  .object({
    // String no formulário, número no envio — mesmo motivo do healthScore:
    // `z.coerce.number()` muda o tipo de ENTRADA do schema e o react-hook-form
    // perde a inferência do campo.
    monthlyValue: z
      .string()
      .min(1, 'Informe o valor mensal')
      .refine(v => !Number.isNaN(Number(v)) && Number(v) >= 0, 'Valor não pode ser negativo'),
    startsAt: z.string().min(1, 'Data de início é obrigatória'),
    endsAt: z.string().optional().or(z.literal('')),
    renewalDate: z.string().optional().or(z.literal('')),
    status: z.enum(['rascunho', 'vigente', 'encerrado']),
    paymentMethod: optionalString.pipe(z.string().max(MAX_LENGTHS.SHORT_TEXT)),
    documentType: z.enum(['cpf', 'cnpj']).optional().or(z.literal('')),
    documentNumber: z.string().optional().or(z.literal('')),
    addressZip: optionalString.pipe(z.string().max(20)),
    addressStreet: optionalString.pipe(z.string().max(MAX_LENGTHS.SHORT_TEXT)),
    addressNumber: optionalString.pipe(z.string().max(20)),
    addressComplement: optionalString.pipe(z.string().max(MAX_LENGTHS.SHORT_TEXT)),
    addressDistrict: optionalString.pipe(z.string().max(MAX_LENGTHS.SHORT_TEXT)),
    addressCity: optionalString.pipe(z.string().max(MAX_LENGTHS.SHORT_TEXT)),
    addressState: optionalString.pipe(z.string().max(2)),
  })
  .refine(d => !d.endsAt || !d.startsAt || d.endsAt >= d.startsAt, {
    message: 'Término não pode ser antes do início',
    path: ['endsAt'],
  })
  // Documento sem tipo não passa no CHECK do banco (o CHECK compara tamanho
  // contra document_type). Pegar aqui devolve mensagem legível em vez de erro
  // de constraint.
  .refine(d => !d.documentNumber || !!d.documentType, {
    message: 'Escolha CPF ou CNPJ antes de informar o número',
    path: ['documentType'],
  });

export type ContractFormData = z.output<typeof contractFormSchema>;
