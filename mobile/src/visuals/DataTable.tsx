import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { color, space, type } from '../design/tokens';
import { formatValue, type TableData } from '../core/dax';

const MAX_ROWS = 8;

const isNumeric = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Quiet data table — micro-caps header, hairline rows, numbers right-aligned
 * in tabular numerals, capped at 8 rows with an honest "N more" tail.
 */
export const DataTable: React.FC<{ data: TableData; maxRows?: number }> = ({
  data,
  maxRows = MAX_ROWS,
}) => {
  const { columns, rows } = data;
  if (columns.length === 0 || rows.length === 0) {
    return <Text style={styles.empty}>No data</Text>;
  }

  const visible = rows.slice(0, maxRows);
  const remaining = rows.length - visible.length;
  // A column is numeric when every present value in it is a finite number.
  const numericCol = columns.map((c) =>
    rows.some((r) => r[c] !== null && r[c] !== undefined) &&
    rows.every((r) => r[c] === null || r[c] === undefined || isNumeric(r[c])),
  );

  return (
    <View
      accessibilityLabel={`Table, ${columns.length} columns, ${rows.length} rows`}
    >
      <View style={[styles.row, styles.headerRow]}>
        {columns.map((c, ci) => (
          <Text
            key={c}
            style={[styles.headerCell, ci === 0 && styles.firstCol, numericCol[ci] && styles.numCell]}
            numberOfLines={1}
          >
            {c.toUpperCase()}
          </Text>
        ))}
      </View>
      {visible.map((r, ri) => (
        <View key={ri} style={styles.row}>
          {columns.map((c, ci) => {
            const v = r[c];
            return (
              <Text
                key={c}
                style={[
                  styles.cell,
                  ci === 0 && styles.firstCol,
                  ci === 0 && styles.leadCell,
                  numericCol[ci] && styles.numCell,
                ]}
                numberOfLines={1}
              >
                {v === null || v === undefined ? '—' : isNumeric(v) ? formatValue(v) : String(v)}
              </Text>
            );
          })}
        </View>
      ))}
      {remaining > 0 ? <Text style={styles.more}>{remaining} more</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  empty: { ...type.caption, color: color.textTertiary, marginTop: space.m },
  row: {
    flexDirection: 'row',
    gap: space.s,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  headerRow: { marginTop: space.s, borderBottomColor: color.hairline },
  headerCell: { ...type.micro, color: color.textTertiary, flex: 1 },
  cell: { ...type.caption, color: color.textSecondary, flex: 1 },
  firstCol: { flex: 1.6 },
  leadCell: { color: color.textPrimary },
  numCell: { textAlign: 'right', fontVariant: ['tabular-nums'] },
  more: { ...type.micro, color: color.textTertiary, marginTop: space.s, textAlign: 'right' },
});
