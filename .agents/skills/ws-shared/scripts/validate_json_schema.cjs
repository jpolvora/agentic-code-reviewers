'use strict';

const fs = require('fs');

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function schemaTypes(schema) {
  if (!schema?.type) return null;
  return Array.isArray(schema.type) ? schema.type : [schema.type];
}

function matchesType(value, type) {
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && !Number.isNaN(value);
  if (type === 'null') return value === null;
  return typeOf(value) === type;
}

function loadJsonSchema(schemaPath, label = 'schema') {
  if (!fs.existsSync(schemaPath)) throw new Error(`${label} missing at ${schemaPath}`);
  return JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
}

function validateNode(value, schema, label) {
  const errors = [];
  if (!schema || typeof schema !== 'object') return errors;

  if (Object.prototype.hasOwnProperty.call(schema, 'const') && value !== schema.const) {
    errors.push(`${label}: expected const ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${label}: expected one of ${schema.enum.join(', ')}`);
  }

  const types = schemaTypes(schema);
  if (types && !types.some((type) => matchesType(value, type))) {
    errors.push(`${label}: expected ${types.join('|')}`);
  }

  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) {
      errors.push(`${label}: string shorter than minLength ${schema.minLength}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${label}: does not match pattern ${schema.pattern}`);
    }
  }

  if (typeof value === 'number' && !Number.isNaN(value)) {
    if (schema.minimum != null && value < schema.minimum) {
      errors.push(`${label}: number below minimum ${schema.minimum}`);
    }
    if (schema.maximum != null && value > schema.maximum) {
      errors.push(`${label}: number above maximum ${schema.maximum}`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) {
      errors.push(`${label}: array shorter than minItems ${schema.minItems}`);
    }
    if (schema.items) {
      for (const [index, item] of value.entries()) {
        errors.push(...validateNode(item, schema.items, `${label}[${index}]`));
      }
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const properties = schema.properties || {};
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          errors.push(`${label}: unexpected key ${key}`);
        }
      }
    }
    for (const key of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push(`${label}: missing required key ${key}`);
      }
    }
    for (const [key, child] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push(...validateNode(value[key], child, `${label}.${key}`));
      }
    }
  }

  return errors;
}

module.exports = { loadJsonSchema, validateNode };
