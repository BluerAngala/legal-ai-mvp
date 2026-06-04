import type { Template, TemplateVariable } from './types.js';

const PLACEHOLDER_PATTERN = /\{\{([^}]+)\}\}/g;

export function extractVariables(content: string): string[] {
  const variables: string[] = [];
  const seen = new Set<string>();

  for (const match of content.matchAll(PLACEHOLDER_PATTERN)) {
    const name = match[1].trim();
    if (!seen.has(name)) {
      seen.add(name);
      variables.push(name);
    }
  }

  return variables;
}

export function validateVariables(
  variables: Record<string, unknown>,
  templateVariables: TemplateVariable[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const tplVar of templateVariables) {
    const value = variables[tplVar.name];

    if (tplVar.required && (value === undefined || value === null || value === '')) {
      errors.push(`Required variable "${tplVar.name}" is missing`);
      continue;
    }

    if (value === undefined || value === null || value === '') {
      continue;
    }

    switch (tplVar.type) {
      case 'text':
      case 'document_ref':
        if (typeof value !== 'string') {
          errors.push(`Variable "${tplVar.name}" must be a string`);
        }
        break;

      case 'date':
        if (typeof value === 'string') {
          const date = new Date(value);
          if (isNaN(date.getTime())) {
            errors.push(`Variable "${tplVar.name}" is not a valid date`);
          }
        } else if (!(value instanceof Date)) {
          errors.push(`Variable "${tplVar.name}" must be a date`);
        }
        break;

      case 'number':
        if (typeof value !== 'number' && isNaN(Number(value))) {
          errors.push(`Variable "${tplVar.name}" must be a number`);
        }
        break;

      case 'select':
        if (tplVar.options && !tplVar.options.some((opt) => opt.value === value)) {
          errors.push(
            `Variable "${tplVar.name}" must be one of: ${tplVar.options.map((o) => o.value).join(', ')}`
          );
        }
        break;
    }
  }

  return { valid: errors.length === 0, errors };
}

function formatValue(value: unknown, type: TemplateVariable['type']): string {
  if (value === undefined || value === null) {
    return '';
  }

  switch (type) {
    case 'date': {
      const date = value instanceof Date ? value : new Date(value as string);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      }
      return String(value);
    }

    case 'number':
      return typeof value === 'number'
        ? value.toLocaleString('zh-CN')
        : Number(value).toLocaleString('zh-CN');

    case 'document_ref': {
      if (typeof value === 'object' && value !== null) {
        const ref = value as { id?: string; title?: string };
        return `[${ref.title || ref.id || '文档'}]`;
      }
      return `[${value}]`;
    }

    case 'text':
    default:
      return String(value);
  }
}

export function fillTemplate(
  template: Template,
  variables: Record<string, unknown>
): string {
  const typeByVar: Record<string, TemplateVariable['type']> = {};
  for (const tplVar of template.variables) {
    typeByVar[tplVar.name] = tplVar.type;
  }

  return template.content.replace(PLACEHOLDER_PATTERN, (_, varName) => {
    const name = varName.trim();
    const value = variables[name];
    const type = typeByVar[name] || 'text';
    return formatValue(value, type);
  });
}

export function createVariableMap(
  templateVariables: TemplateVariable[]
): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const tplVar of templateVariables) {
    map[tplVar.name] = tplVar.defaultValue ?? null;
  }
  return map;
}
