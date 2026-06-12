export function escapeTableName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

export function escapeBracketName(name: string): string {
  return `[${name.replace(/]/g, ']]')}]`;
}

export function columnRef(table: string, column: string): string {
  return `${escapeTableName(table)}${escapeBracketName(column)}`;
}

export function measureRef(name: string): string {
  return escapeBracketName(name);
}

export function daxStringLiteral(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}
